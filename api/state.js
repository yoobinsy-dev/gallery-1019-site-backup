const { sendJson, methodNotAllowed, readJsonBody } = require('./_lib/http');
const { createHash } = require('crypto');
const { getStateMap, getStateMetaMap, getStateMapWithMeta, setStateValue, deleteStateValue } = require('./_lib/state-store');
const { logStateWriteAttempt, recordAlert, maybeTriggerConflictSpikeAlert } = require('./_lib/audit-store');
const { buildTransferSafeExhibitions, migrateExhibitionImageReferences } = require('./_lib/exhibition-image-refs');

const ALLOWED_KEYS = new Set(['users', 'exhibitions', 'pottery-students-v1', 'studio-calendar-state-v1']);
const STRICT_VERSION_KEYS = new Set(['users', 'pottery-students-v1', 'studio-calendar-state-v1']);
const HARD_DROP_MIN_PREVIOUS_TOTAL = 20;
const HARD_DROP_MIN_ABSOLUTE = 15;
const HARD_DROP_RATIO = 0.7;
const USER_DROP_MIN_PREVIOUS_TOTAL = 3;
const USER_DROP_MIN_ABSOLUTE = 2;
const USER_DROP_RATIO = 0.5;

function toEpochMs(value) {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt) {
  if (!baseUpdatedAt || !serverUpdatedAt) return false;
  return toEpochMs(serverUpdatedAt) > toEpochMs(baseUpdatedAt);
}

function hasKnownServerVersion(updatedAt) {
  return Boolean(updatedAt && toEpochMs(updatedAt) > 0);
}

function getExhibitionTimestamp(exhibition) {
  if (!exhibition || typeof exhibition !== 'object') return 0;
  return Math.max(
    toEpochMs(exhibition.updatedAt),
    toEpochMs(exhibition.modifiedAt),
    toEpochMs(exhibition.lastModifiedAt),
    toEpochMs(exhibition.createdAt)
  );
}

function getInventoryCount(exhibition) {
  if (!exhibition || typeof exhibition !== 'object') return 0;
  const art = Array.isArray(exhibition.artWorks)
    ? exhibition.artWorks.length
    : (Array.isArray(exhibition.works) ? exhibition.works.length : 0);
  const goods = Array.isArray(exhibition.goods) ? exhibition.goods.length : 0;
  const soldArt = Array.isArray(exhibition.artSoldWorks)
    ? exhibition.artSoldWorks.length
    : (Array.isArray(exhibition.soldWorks) ? exhibition.soldWorks.length : 0);
  const soldGoods = Array.isArray(exhibition.soldGoods) ? exhibition.soldGoods.length : 0;
  return art + goods + soldArt + soldGoods;
}

function hasPreviewFields(item) {
  if (!item || typeof item !== 'object') return false;
  return Boolean(
    (typeof item.photoPreviewUrl === 'string' && item.photoPreviewUrl.trim())
    || (typeof item.photoUrl === 'string' && item.photoUrl.trim())
    ||
    (typeof item.photoPreviewDataUrl === 'string' && item.photoPreviewDataUrl.trim())
    || (typeof item.photoDataUrl === 'string' && item.photoDataUrl.trim())
  );
}

function getPreviewIdentity(item) {
  if (!item || typeof item !== 'object') return '';

  const id = Number(item.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;

  const workId = Number(item.workId);
  if (Number.isFinite(workId) && workId > 0) return `work:${workId}`;

  const manualNumber = (item.manualNumber || '').toString().trim().toLowerCase();
  const title = (item.title || '').toString().trim().toLowerCase();
  if (manualNumber || title) return `manual:${manualNumber}|title:${title}`;
  return '';
}

function mergeItemPreviewFields(baseItem, incomingItem) {
  if (!incomingItem || typeof incomingItem !== 'object') return incomingItem;
  if (!baseItem || typeof baseItem !== 'object') return incomingItem;

  const merged = { ...incomingItem };

  if ((!merged.photoPreviewUrl || !String(merged.photoPreviewUrl).trim())
    && typeof baseItem.photoPreviewUrl === 'string'
    && baseItem.photoPreviewUrl.trim()) {
    merged.photoPreviewUrl = baseItem.photoPreviewUrl;
  }

  if ((!merged.photoUrl || !String(merged.photoUrl).trim())
    && typeof baseItem.photoUrl === 'string'
    && baseItem.photoUrl.trim()) {
    merged.photoUrl = baseItem.photoUrl;
  }

  if ((!merged.photoPreviewDataUrl || !String(merged.photoPreviewDataUrl).trim())
    && typeof baseItem.photoPreviewDataUrl === 'string'
    && baseItem.photoPreviewDataUrl.trim()) {
    merged.photoPreviewDataUrl = baseItem.photoPreviewDataUrl;
  }

  if ((!merged.photoDataUrl || !String(merged.photoDataUrl).trim())
    && typeof baseItem.photoDataUrl === 'string'
    && baseItem.photoDataUrl.trim()) {
    merged.photoDataUrl = baseItem.photoDataUrl;
  }

  if (!hasPreviewFields(incomingItem) && hasPreviewFields(baseItem)) {
    if ((!merged.photoPreviewDataUrl || !merged.photoPreviewDataUrl.trim())
      && typeof baseItem.photoPreviewDataUrl === 'string') {
      merged.photoPreviewDataUrl = baseItem.photoPreviewDataUrl;
    }

    if ((!merged.photoDataUrl || !merged.photoDataUrl.trim())
      && typeof baseItem.photoDataUrl === 'string') {
      merged.photoDataUrl = baseItem.photoDataUrl;
    }
  }

  return merged;
}

function mergeListPreviewFields(baseList, incomingList) {
  if (!Array.isArray(incomingList)) return incomingList;
  if (!Array.isArray(baseList) || baseList.length === 0) return incomingList;

  const baseByIdentity = new Map();
  baseList.forEach((item) => {
    const key = getPreviewIdentity(item);
    if (!key) return;
    if (!baseByIdentity.has(key)) {
      baseByIdentity.set(key, item);
    }
  });

  return incomingList.map((item) => {
    const key = getPreviewIdentity(item);
    if (!key) return item;
    return mergeItemPreviewFields(baseByIdentity.get(key), item);
  });
}

function mergeExhibitionPreviewFields(baseExhibition, incomingExhibition) {
  if (!incomingExhibition || typeof incomingExhibition !== 'object') return incomingExhibition;
  if (!baseExhibition || typeof baseExhibition !== 'object') return incomingExhibition;

  const merged = { ...incomingExhibition };
  ['artWorks', 'goods', 'artSoldWorks', 'soldGoods', 'works', 'soldWorks'].forEach((field) => {
    if (Array.isArray(incomingExhibition[field])) {
      merged[field] = mergeListPreviewFields(baseExhibition[field], incomingExhibition[field]);
    }
  });

  return merged;
}

function hasExplicitInventoryClearMarker(exhibition) {
  return Boolean(
    exhibition
    && typeof exhibition.inventoryExplicitlyClearedAt === 'string'
    && exhibition.inventoryExplicitlyClearedAt.trim()
  );
}

function detectLargeUnexpectedInventoryDrop(currentValue, incomingValue, options = {}) {
  if (!Array.isArray(currentValue) || !Array.isArray(incomingValue)) return null;

  const onlyTouchedIds = options.onlyTouchedIds instanceof Set ? options.onlyTouchedIds : null;
  const treatMissingAsZero = options.treatMissingAsZero !== false;

  const incomingById = new Map(
    incomingValue
      .filter((item) => item && typeof item === 'object')
      .map((item) => [Number(item.id), item])
  );

  for (const current of currentValue) {
    const id = Number(current?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (onlyTouchedIds && !onlyTouchedIds.has(id)) continue;

    const previousCount = getInventoryCount(current);
    if (previousCount < HARD_DROP_MIN_PREVIOUS_TOTAL) continue;

    const incoming = incomingById.get(id);
    if (!incoming && !treatMissingAsZero) continue;
    const nextCount = getInventoryCount(incoming);
    const dropped = previousCount - nextCount;

    if (dropped < HARD_DROP_MIN_ABSOLUTE) continue;
    if (dropped / previousCount < HARD_DROP_RATIO) continue;

    if (hasExplicitInventoryClearMarker(incoming)) {
      continue;
    }

    return {
      exhibitionId: id,
      previousCount,
      nextCount,
      dropped,
      ratio: dropped / previousCount
    };
  }

  return null;
}

function getClientIdFromRequest(req) {
  const fromHeader = typeof req.headers?.['x-cloud-client-id'] === 'string'
    ? req.headers['x-cloud-client-id'].trim()
    : '';
  return fromHeader || null;
}

function normalizeUserIdentityPart(value) {
  return String(value || '').trim().toLowerCase();
}

function buildUserIdentityKeys(user) {
  const keys = [];
  const id = Number(user?.id);
  if (Number.isFinite(id) && id > 0) {
    keys.push(`id:${id}`);
  }

  const username = normalizeUserIdentityPart(user?.username);
  if (username) keys.push(`username:${username}`);

  const email = normalizeUserIdentityPart(user?.email);
  if (email) keys.push(`email:${email}`);

  const name = normalizeUserIdentityPart(user?.name);
  if (name) keys.push(`name:${name}`);

  return keys;
}

function mergeUsersPreservingPasswords(currentUsers, incomingUsers) {
  if (!Array.isArray(incomingUsers)) return incomingUsers;
  const current = Array.isArray(currentUsers) ? currentUsers : [];

  const currentByIdentity = new Map();
  current.forEach((user) => {
    if (!user || typeof user !== 'object') return;
    buildUserIdentityKeys(user).forEach((key) => {
      if (!currentByIdentity.has(key)) {
        currentByIdentity.set(key, user);
      }
    });
  });

  return incomingUsers.map((user) => {
    if (!user || typeof user !== 'object') return user;

    const hasIncomingPassword = Boolean(String(user.password || '').trim());
    if (hasIncomingPassword) return user;

    const identities = buildUserIdentityKeys(user);
    const matched = identities
      .map((key) => currentByIdentity.get(key))
      .find((candidate) => candidate && typeof candidate === 'object');

    const preservedPassword = String(matched?.password || '').trim();
    if (!preservedPassword) return user;

    return {
      ...user,
      password: preservedPassword
    };
  });
}

function indexUsersByIdentity(users) {
  const map = new Map();
  (Array.isArray(users) ? users : []).forEach((user) => {
    if (!user || typeof user !== 'object') return;
    buildUserIdentityKeys(user).forEach((key) => {
      if (!map.has(key)) {
        map.set(key, user);
      }
    });
  });
  return map;
}

function findUserIndex(users, targetUser) {
  if (!Array.isArray(users) || !targetUser || typeof targetUser !== 'object') {
    return -1;
  }

  const targetId = Number(targetUser.id);
  if (Number.isFinite(targetId) && targetId > 0) {
    const byIdIndex = users.findIndex((user) => Number(user?.id) === targetId);
    if (byIdIndex !== -1) {
      return byIdIndex;
    }
  }

  const targetIdentitySet = new Set(buildUserIdentityKeys(targetUser));
  if (targetIdentitySet.size === 0) {
    return -1;
  }

  return users.findIndex((user) => {
    const identities = buildUserIdentityKeys(user);
    return identities.some((identity) => targetIdentitySet.has(identity));
  });
}

function mergeSingleUserPreservingPassword(currentUsersByIdentity, incomingUser) {
  if (!incomingUser || typeof incomingUser !== 'object') return incomingUser;

  const hasIncomingPassword = Boolean(String(incomingUser.password || '').trim());
  if (hasIncomingPassword) {
    return incomingUser;
  }

  const matched = buildUserIdentityKeys(incomingUser)
    .map((key) => currentUsersByIdentity.get(key))
    .find((candidate) => candidate && typeof candidate === 'object');
  const preservedPassword = String(matched?.password || '').trim();
  if (!preservedPassword) {
    return incomingUser;
  }

  return {
    ...incomingUser,
    password: preservedPassword
  };
}

function mergeUsersWithDelta(currentUsers, incomingUsers, removedIds = []) {
  const current = Array.isArray(currentUsers) ? currentUsers : [];
  const incoming = Array.isArray(incomingUsers) ? incomingUsers : [];
  const currentByIdentity = indexUsersByIdentity(current);
  const mergedUsers = current.slice();

  incoming.forEach((incomingUser) => {
    if (!incomingUser || typeof incomingUser !== 'object') return;
    const mergedIncoming = mergeSingleUserPreservingPassword(currentByIdentity, incomingUser);
    const existingIndex = findUserIndex(mergedUsers, mergedIncoming);
    if (existingIndex === -1) {
      mergedUsers.push(mergedIncoming);
    } else {
      mergedUsers[existingIndex] = mergedIncoming;
    }
  });

  const removeIdSet = new Set(
    (Array.isArray(removedIds) ? removedIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );

  const uniqueUsers = [];
  const seenIdentities = new Set();
  mergedUsers.forEach((user) => {
    if (!user || typeof user !== 'object') return;
    const id = Number(user.id);
    if (removeIdSet.has(id)) return;

    const primaryIdentity = buildUserIdentityKeys(user)[0] || `anon:${uniqueUsers.length}`;
    if (seenIdentities.has(primaryIdentity)) return;
    seenIdentities.add(primaryIdentity);
    uniqueUsers.push(user);
  });

  return uniqueUsers;
}

function hasUsersWithMissingPasswords(users) {
  if (!Array.isArray(users)) return false;
  return users.some((user) => {
    if (!user || typeof user !== 'object') return false;
    return !String(user.password || '').trim();
  });
}

function hasAdminRoleValue(value) {
  return String(value || '').trim() === '어드민';
}

function hasAtLeastOneAdminWithPassword(users) {
  if (!Array.isArray(users)) return false;
  return users.some((user) => {
    if (!user || typeof user !== 'object') return false;
    const hasPassword = Boolean(String(user.password || '').trim());
    if (!hasPassword) return false;

    return hasAdminRoleValue(user.accountType)
      || hasAdminRoleValue(user.studioRole)
      || hasAdminRoleValue(user.galleryRole);
  });
}

function detectSuspiciousUserDrop(currentUsers, nextUsers, removedIds = []) {
  if (!Array.isArray(currentUsers) || !Array.isArray(nextUsers)) return null;

  const previousCount = currentUsers.length;
  const nextCount = nextUsers.length;
  if (previousCount < USER_DROP_MIN_PREVIOUS_TOTAL) return null;
  if (nextCount >= previousCount) return null;

  const dropped = previousCount - nextCount;
  const ratio = dropped / previousCount;
  if (dropped < USER_DROP_MIN_ABSOLUTE) return null;
  if (ratio < USER_DROP_RATIO) return null;

  const removedCount = Array.isArray(removedIds) ? removedIds.length : 0;
  if (removedCount >= dropped) {
    return null;
  }

  return {
    previousCount,
    nextCount,
    dropped,
    ratio,
    explicitRemovedIds: removedCount
  };
}

function mergeStringArrayUnique(current, incoming) {
  const merged = [];
  const seen = new Set();
  const append = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(normalized);
  };

  (Array.isArray(current) ? current : []).forEach(append);
  (Array.isArray(incoming) ? incoming : []).forEach(append);
  return merged;
}

function mergeByIdentityArray(currentList, incomingList, identityResolver) {
  const current = Array.isArray(currentList) ? currentList : [];
  const incoming = Array.isArray(incomingList) ? incomingList : [];

  const merged = current.slice();
  const indexByIdentity = new Map();

  const setIdentity = (item, index) => {
    const identity = identityResolver(item);
    if (!identity) return;
    if (!indexByIdentity.has(identity)) {
      indexByIdentity.set(identity, index);
    }
  };

  merged.forEach((item, index) => setIdentity(item, index));

  incoming.forEach((incomingItem) => {
    const identity = identityResolver(incomingItem);
    if (!identity) {
      merged.push(incomingItem);
      return;
    }

    const existingIndex = indexByIdentity.get(identity);
    if (typeof existingIndex === 'number') {
      merged[existingIndex] = incomingItem;
      return;
    }

    merged.push(incomingItem);
    indexByIdentity.set(identity, merged.length - 1);
  });

  return merged;
}

function resolveStudentIdentity(student) {
  if (!student || typeof student !== 'object') return '';
  const id = String(student.id || '').trim();
  if (id) return `id:${id}`;
  const name = String(student.name || '').trim().toLowerCase();
  if (name) return `name:${name}`;
  return '';
}

function mergeStudentRecord(currentStudent, incomingStudent) {
  if (!currentStudent || typeof currentStudent !== 'object') return incomingStudent;
  if (!incomingStudent || typeof incomingStudent !== 'object') return currentStudent;

  return {
    ...currentStudent,
    ...incomingStudent,
    paymentHistory: mergeStringArrayUnique(currentStudent.paymentHistory, incomingStudent.paymentHistory)
  };
}

function mergeStudentsState(currentStudents, incomingStudents) {
  if (!Array.isArray(currentStudents)) return Array.isArray(incomingStudents) ? incomingStudents : [];
  if (!Array.isArray(incomingStudents)) return currentStudents;

  const currentByIdentity = new Map();
  currentStudents.forEach((student) => {
    const identity = resolveStudentIdentity(student);
    if (!identity || currentByIdentity.has(identity)) return;
    currentByIdentity.set(identity, student);
  });

  return mergeByIdentityArray(currentStudents, incomingStudents, resolveStudentIdentity)
    .map((student) => {
      const identity = resolveStudentIdentity(student);
      if (!identity) return student;
      const current = currentByIdentity.get(identity);
      return mergeStudentRecord(current, student);
    });
}

function resolveItemIdentity(item) {
  if (!item || typeof item !== 'object') return '';
  const id = String(item.id || '').trim();
  if (id) return `id:${id}`;

  const date = String(item.date || '').trim();
  const title = String(item.title || '').trim().toLowerCase();
  const kind = String(item.kind || '').trim().toLowerCase();
  const start = String(item.start || '').trim();
  const end = String(item.end || '').trim();
  if (date || title || kind || start || end) {
    return `sig:${date}|${title}|${kind}|${start}|${end}`;
  }
  return '';
}

function mergeRulesByIdentity(currentRules, incomingRules) {
  return mergeByIdentityArray(currentRules, incomingRules, (rule) => {
    if (!rule || typeof rule !== 'object') return '';
    const id = String(rule.id || '').trim();
    if (id) return `id:${id}`;
    const day = Number(rule.day);
    const startSlot = Number(rule.startSlot);
    const endSlot = Number(rule.endSlot);
    const type = String(rule.type || '').trim();
    if (Number.isFinite(day) && Number.isFinite(startSlot) && Number.isFinite(endSlot)) {
      return `sig:${day}|${startSlot}|${endSlot}|${type}`;
    }
    return '';
  });
}

function mergeTimelineByWeek(currentTimeline, incomingTimeline) {
  const current = Array.isArray(currentTimeline) ? currentTimeline : [];
  const incoming = Array.isArray(incomingTimeline) ? incomingTimeline : [];

  const mergedByWeek = new Map();

  current.forEach((entry) => {
    const weekKey = String(entry?.weekKey || '').trim();
    if (!weekKey) return;
    mergedByWeek.set(weekKey, {
      weekKey,
      rules: Array.isArray(entry.rules) ? entry.rules : []
    });
  });

  incoming.forEach((entry) => {
    const weekKey = String(entry?.weekKey || '').trim();
    if (!weekKey) return;
    const existing = mergedByWeek.get(weekKey);
    if (!existing) {
      mergedByWeek.set(weekKey, {
        weekKey,
        rules: Array.isArray(entry.rules) ? entry.rules : []
      });
      return;
    }

    mergedByWeek.set(weekKey, {
      weekKey,
      rules: mergeRulesByIdentity(existing.rules, Array.isArray(entry.rules) ? entry.rules : [])
    });
  });

  return Array.from(mergedByWeek.values()).sort((a, b) => String(a.weekKey).localeCompare(String(b.weekKey)));
}

function mergeWeekOverrides(currentOverrides, incomingOverrides) {
  const current = currentOverrides && typeof currentOverrides === 'object' ? currentOverrides : {};
  const incoming = incomingOverrides && typeof incomingOverrides === 'object' ? incomingOverrides : {};
  const merged = { ...current };

  Object.keys(incoming).forEach((weekKey) => {
    const incomingRules = Array.isArray(incoming[weekKey]) ? incoming[weekKey] : [];
    const currentRules = Array.isArray(current[weekKey]) ? current[weekKey] : [];
    merged[weekKey] = mergeRulesByIdentity(currentRules, incomingRules);
  });

  return merged;
}

function mergeCalendarLog(currentLog, incomingLog) {
  const current = Array.isArray(currentLog) ? currentLog : [];
  const incoming = Array.isArray(incomingLog) ? incomingLog : [];
  const merged = [];
  const seen = new Set();

  const append = (entry) => {
    const signature = JSON.stringify(entry || {});
    if (seen.has(signature)) return;
    seen.add(signature);
    merged.push(entry);
  };

  current.forEach(append);
  incoming.forEach(append);
  return merged;
}

function mergeStudioCalendarState(currentState, incomingState) {
  const current = currentState && typeof currentState === 'object' ? currentState : {};
  const incoming = incomingState && typeof incomingState === 'object' ? incomingState : {};

  return {
    ...current,
    ...incoming,
    events: mergeByIdentityArray(current.events, incoming.events, resolveItemIdentity),
    baseRules: mergeRulesByIdentity(current.baseRules, incoming.baseRules),
    baseRuleTimeline: mergeTimelineByWeek(current.baseRuleTimeline, incoming.baseRuleTimeline),
    baseWeekOverrides: mergeWeekOverrides(current.baseWeekOverrides, incoming.baseWeekOverrides),
    studioUsers: mergeStringArrayUnique(current.studioUsers, incoming.studioUsers),
    classTeachingLog: mergeCalendarLog(current.classTeachingLog, incoming.classTeachingLog)
  };
}

function getRequestId(req) {
  const fromHeader = typeof req.headers?.['x-request-id'] === 'string'
    ? req.headers['x-request-id'].trim()
    : '';
  if (fromHeader) return fromHeader;
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function choosePreferredExhibition(currentExhibition, incomingExhibition) {
  const currentTs = getExhibitionTimestamp(currentExhibition);
  const incomingTs = getExhibitionTimestamp(incomingExhibition);

  if (incomingTs > currentTs) return mergeExhibitionPreviewFields(currentExhibition, incomingExhibition);
  if (currentTs > incomingTs) return mergeExhibitionPreviewFields(incomingExhibition, currentExhibition);

  const currentCount = getInventoryCount(currentExhibition);
  const incomingCount = getInventoryCount(incomingExhibition);
  if (incomingCount > currentCount) return mergeExhibitionPreviewFields(currentExhibition, incomingExhibition);
  return mergeExhibitionPreviewFields(incomingExhibition, currentExhibition);
}

function mergeExhibitionsState(currentValue, incomingValue) {
  if (!Array.isArray(currentValue)) return incomingValue;
  if (!Array.isArray(incomingValue)) return currentValue;

  const mergedById = new Map();
  const appendWithoutId = [];

  currentValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    if (!mergedById.has(id)) {
      mergedById.set(id, item);
    }
  });

  incomingValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    const current = mergedById.get(id);
    if (!current) {
      mergedById.set(id, item);
      return;
    }

    mergedById.set(id, choosePreferredExhibition(current, item));
  });

  const merged = Array.from(mergedById.values());
  if (appendWithoutId.length > 0) {
    merged.push(...appendWithoutId);
  }
  return merged;
}

function mergeExhibitionsStatePreferServerOnConflict(currentValue, incomingValue) {
  if (!Array.isArray(currentValue)) return incomingValue;
  if (!Array.isArray(incomingValue)) return currentValue;

  const mergedById = new Map();
  const appendWithoutId = [];

  currentValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    if (!mergedById.has(id)) {
      mergedById.set(id, item);
    }
  });

  incomingValue.forEach((item) => {
    const id = Number(item?.id);
    if (!Number.isFinite(id) || id <= 0) {
      appendWithoutId.push(item);
      return;
    }

    const current = mergedById.get(id);
    if (!current) {
      mergedById.set(id, item);
      return;
    }

    // On stale conflicts, keep server exhibition state, but still heal missing preview fields.
    mergedById.set(id, mergeExhibitionPreviewFields(item, current));
  });

  const merged = Array.from(mergedById.values());
  if (appendWithoutId.length > 0) {
    merged.push(...appendWithoutId);
  }
  return merged;
}

function sanitizeRequestedKeys(raw) {
  if (!raw) return ['users', 'exhibitions', 'pottery-students-v1', 'studio-calendar-state-v1'];
  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => ALLOWED_KEYS.has(item));

  return parsed.length > 0 ? parsed : ['users', 'exhibitions', 'pottery-students-v1', 'studio-calendar-state-v1'];
}

function buildExhibitionsSummary(exhibitions) {
  if (!Array.isArray(exhibitions)) return [];

  return exhibitions.map((exhibition) => {
    if (!exhibition || typeof exhibition !== 'object') return exhibition;
    return {
      id: exhibition.id,
      title: exhibition.title,
      startDate: exhibition.startDate,
      endDate: exhibition.endDate,
      type: exhibition.type,
      participants: Array.isArray(exhibition.participants) ? exhibition.participants : [],
      staff: exhibition.staff || { planners: [], artists: [], staffs: [] },
      active: Boolean(exhibition.active),
      createdAt: exhibition.createdAt || null,
      updatedAt: exhibition.updatedAt || null
    };
  });
}

function buildTransferSafeStateData(data, options = {}) {
  const view = String(options.view || '').trim().toLowerCase();
  if (!data || typeof data !== 'object') {
    return {
      data,
      stats: null
    };
  }

  if (!Array.isArray(data.exhibitions)) {
    return {
      data,
      stats: null
    };
  }

  const transferSafe = buildTransferSafeExhibitions(data.exhibitions);
  const nextData = { ...data, exhibitions: transferSafe.exhibitions };
  if (view === 'summary') {
    nextData.exhibitions = buildExhibitionsSummary(nextData.exhibitions);
  }

  return {
    data: nextData,
    stats: transferSafe.stats
  };
}

function normalizeStateMeta(keys, rawMeta) {
  const normalized = {};
  keys.forEach((key) => {
    normalized[key] = {
      updatedAt: rawMeta?.[key]?.updatedAt || null
    };
  });
  return normalized;
}

function buildStateEtag(keys, meta) {
  const fingerprint = keys
    .map((key) => `${key}:${meta?.[key]?.updatedAt || 'null'}`)
    .join('|');
  const digest = createHash('sha1').update(fingerprint).digest('hex');
  return `W/"state-${digest}"`;
}

function requestHasMatchingEtag(ifNoneMatchHeader, etag) {
  if (!ifNoneMatchHeader || !etag) return false;
  const normalized = String(ifNoneMatchHeader)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.includes('*') || normalized.includes(etag);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const keys = sanitizeRequestedKeys(req.query.keys);
      const view = String(req.query.view || '').trim().toLowerCase();
      const rawMeta = await getStateMetaMap(keys);
      const meta = normalizeStateMeta(keys, rawMeta);
      const etag = buildStateEtag(keys, meta);

      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

      if (requestHasMatchingEtag(req.headers?.['if-none-match'], etag)) {
        res.statusCode = 304;
        res.end();
        return;
      }

      const data = await getStateMap(keys);
      const transferSafe = buildTransferSafeStateData(data, { view });
      const responsePayload = {
        ok: true,
        data: transferSafe.data,
        meta
      };

      const responseBytes = Buffer.byteLength(JSON.stringify(responsePayload), 'utf8');
      res.setHeader('X-State-Response-Bytes', String(responseBytes));

      if (Array.isArray(transferSafe.data?.exhibitions)) {
        console.log('[api/state:get]', {
          keys,
          view: view || 'full',
          responseBytes,
          exhibitionCount: transferSafe.data.exhibitions.length,
          transferStats: transferSafe.stats || null
        });
      }

      sendJson(res, 200, responsePayload);
      return;
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req);
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      const baseUpdatedAt = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt.trim() : '';
      const requestId = getRequestId(req);
      const clientId = getClientIdFromRequest(req);

      if (!ALLOWED_KEYS.has(key)) {
        sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions, pottery-students-v1, studio-calendar-state-v1.' });
        return;
      }

      const { meta: currentMeta } = await getStateMapWithMeta([key]);
      const serverUpdatedAt = currentMeta?.[key]?.updatedAt || '';

      if (STRICT_VERSION_KEYS.has(key) && hasKnownServerVersion(serverUpdatedAt) && !baseUpdatedAt) {
        await logStateWriteAttempt({
          requestId,
          stateKey: key,
          action: 'PUT',
          decision: 'conflict_rejected',
          reason: 'missing-client-base-version',
          baseUpdatedAt,
          serverUpdatedAt,
          clientId
        });
        await maybeTriggerConflictSpikeAlert();

        sendJson(res, 409, {
          ok: false,
          error: 'State conflict: missing client base version for users data.',
          conflict: {
            key,
            serverUpdatedAt,
            baseUpdatedAt: null
          }
        });
        return;
      }

      if (STRICT_VERSION_KEYS.has(key) && isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt)) {
        await logStateWriteAttempt({
          requestId,
          stateKey: key,
          action: 'PUT',
          decision: 'conflict_rejected',
          reason: 'server-newer-than-client-base',
          baseUpdatedAt,
          serverUpdatedAt,
          clientId
        });
        await maybeTriggerConflictSpikeAlert();

        sendJson(res, 409, {
          ok: false,
          error: 'State conflict: server has newer users data.',
          conflict: {
            key,
            serverUpdatedAt,
            baseUpdatedAt: baseUpdatedAt || null
          }
        });
        return;
      }

      let valueToPersist = body.value;
      let mergedOnConflict = false;
      let imageMigrationStats = null;
      let writeReason = mergedOnConflict ? 'stale-client-merged-server-side' : 'normal-write';
      let writeDetails;

      if (key === 'users' && Array.isArray(body.value)) {
        const existingMap = await getStateMap(['users']);
        const currentUsers = Array.isArray(existingMap.users) ? existingMap.users : [];
        const syncMode = String(body.syncMode || 'full').trim().toLowerCase() === 'delta' ? 'delta' : 'full';
        const removedIds = Array.isArray(body.removedIds)
          ? body.removedIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id) && id > 0)
          : [];

        if (syncMode === 'delta') {
          valueToPersist = mergeUsersWithDelta(currentUsers, body.value, removedIds);
          writeReason = 'users-delta-merged';
        } else {
          valueToPersist = mergeUsersWithDelta(currentUsers, body.value, removedIds);
          writeReason = 'users-full-merged-with-guards';
        }

        const blockedDrop = detectSuspiciousUserDrop(currentUsers, valueToPersist, removedIds);
        if (blockedDrop) {
          await logStateWriteAttempt({
            requestId,
            stateKey: key,
            action: 'PUT',
            decision: 'drop_blocked',
            reason: 'large-unexpected-user-drop-without-explicit-removals',
            baseUpdatedAt,
            serverUpdatedAt,
            incomingCount: body.value.length,
            serverCount: currentUsers.length,
            mergedCount: valueToPersist.length,
            clientId,
            details: {
              ...blockedDrop,
              syncMode
            }
          });

          await recordAlert({
            alertType: 'large-user-drop-blocked',
            severity: 'critical',
            message: `Blocked suspicious user drop from ${blockedDrop.previousCount} to ${blockedDrop.nextCount}.`,
            details: blockedDrop
          });

          sendJson(res, 422, {
            ok: false,
            error: 'Blocked suspicious user account drop. Retry with explicit removals from a fresh client state.',
            blocked: blockedDrop
          });
          return;
        }

        if (hasUsersWithMissingPasswords(valueToPersist)) {
          await logStateWriteAttempt({
            requestId,
            stateKey: key,
            action: 'PUT',
            decision: 'rejected',
            reason: 'users-missing-password-after-merge',
            baseUpdatedAt,
            serverUpdatedAt,
            incomingCount: body.value.length,
            serverCount: currentUsers.length,
            mergedCount: valueToPersist.length,
            clientId,
            details: {
              syncMode,
              removedIdsCount: removedIds.length
            }
          });

          await recordAlert({
            alertType: 'users-missing-password-rejected',
            severity: 'critical',
            message: 'Rejected users write because one or more accounts had missing passwords after merge.',
            details: {
              syncMode,
              removedIdsCount: removedIds.length
            }
          });

          sendJson(res, 422, {
            ok: false,
            error: 'Rejected users write: one or more accounts would have missing passwords.'
          });
          return;
        }

        if (!hasAtLeastOneAdminWithPassword(valueToPersist)) {
          await logStateWriteAttempt({
            requestId,
            stateKey: key,
            action: 'PUT',
            decision: 'rejected',
            reason: 'users-missing-admin-with-password',
            baseUpdatedAt,
            serverUpdatedAt,
            incomingCount: body.value.length,
            serverCount: currentUsers.length,
            mergedCount: valueToPersist.length,
            clientId,
            details: {
              syncMode,
              removedIdsCount: removedIds.length
            }
          });

          await recordAlert({
            alertType: 'users-admin-invariant-rejected',
            severity: 'critical',
            message: 'Rejected users write because no admin account with password would remain.',
            details: {
              syncMode,
              removedIdsCount: removedIds.length
            }
          });

          sendJson(res, 422, {
            ok: false,
            error: 'Rejected users write: at least one admin account with password must remain.'
          });
          return;
        }

        writeDetails = {
          syncMode,
          removedIdsCount: removedIds.length
        };
      }

      if (key === 'pottery-students-v1' && Array.isArray(body.value)) {
        const existingMap = await getStateMap(['pottery-students-v1']);
        const currentStudents = Array.isArray(existingMap['pottery-students-v1']) ? existingMap['pottery-students-v1'] : [];
        valueToPersist = mergeStudentsState(currentStudents, body.value);
        writeReason = 'pottery-students-merged';
      }

      if (key === 'studio-calendar-state-v1' && body.value && typeof body.value === 'object') {
        const existingMap = await getStateMap(['studio-calendar-state-v1']);
        const currentCalendar = existingMap['studio-calendar-state-v1'] && typeof existingMap['studio-calendar-state-v1'] === 'object'
          ? existingMap['studio-calendar-state-v1']
          : {};
        valueToPersist = mergeStudioCalendarState(currentCalendar, body.value);
        writeReason = 'studio-calendar-merged';
      }

      if (key === 'exhibitions') {
        const existingMap = await getStateMap(['exhibitions']);
        const currentExhibitions = Array.isArray(existingMap.exhibitions) ? existingMap.exhibitions : [];
        const syncMode = String(body.syncMode || 'full').trim().toLowerCase() === 'delta' ? 'delta' : 'full';
        const incomingExhibitions = Array.isArray(body.value) ? body.value : [];
        const staleConflict = isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt);

        if (syncMode === 'delta' && incomingExhibitions.length === 0) {
          await logStateWriteAttempt({
            requestId,
            stateKey: key,
            action: 'PUT',
            decision: 'accepted',
            reason: 'delta-noop',
            baseUpdatedAt,
            serverUpdatedAt,
            incomingCount: 0,
            serverCount: currentExhibitions.length,
            mergedCount: currentExhibitions.length,
            clientId,
            details: { syncMode }
          });

          sendJson(res, 200, {
            ok: true,
            meta: {
              key,
              updatedAt: serverUpdatedAt || null
            },
            mergedOnConflict: false
          });
          return;
        }

        const touchedIds = syncMode === 'delta'
          ? new Set(
            incomingExhibitions
              .map((item) => Number(item?.id))
              .filter((id) => Number.isFinite(id) && id > 0)
          )
          : null;

        const blockedDrop = detectLargeUnexpectedInventoryDrop(currentExhibitions, incomingExhibitions, {
          onlyTouchedIds: touchedIds,
          treatMissingAsZero: syncMode !== 'delta'
        });
        if (blockedDrop) {
          await logStateWriteAttempt({
            requestId,
            stateKey: key,
            action: 'PUT',
            decision: 'drop_blocked',
            reason: 'large-unexpected-inventory-drop-without-marker',
            baseUpdatedAt,
            serverUpdatedAt,
            incomingCount: incomingExhibitions.length,
            serverCount: currentExhibitions.length,
            mergedCount: currentExhibitions.length,
            clientId,
            details: {
              ...blockedDrop,
              syncMode
            }
          });

          await recordAlert({
            alertType: 'large-drop-blocked',
            severity: 'critical',
            message: `Blocked large inventory drop for exhibition ${blockedDrop.exhibitionId}.`,
            details: blockedDrop
          });

          sendJson(res, 422, {
            ok: false,
            error: 'Blocked suspicious large inventory drop. Add explicit clear marker to allow this reset.',
            blocked: blockedDrop
          });
          return;
        }

        mergedOnConflict = staleConflict;
        valueToPersist = staleConflict
            ? mergeExhibitionsStatePreferServerOnConflict(currentExhibitions, incomingExhibitions)
            : mergeExhibitionsState(currentExhibitions, incomingExhibitions);

        const configuredMaxUploads = Number(process.env.EXHIBITION_IMAGE_MIGRATION_MAX_UPLOADS);
        const migration = await migrateExhibitionImageReferences(valueToPersist, {
          maxUploads: Number.isFinite(configuredMaxUploads) ? configuredMaxUploads : 0
        });
        valueToPersist = migration.exhibitions;
        imageMigrationStats = migration.stats;
      }

      const updatedAt = await setStateValue(key, valueToPersist);

      await logStateWriteAttempt({
        requestId,
        stateKey: key,
        action: 'PUT',
        decision: mergedOnConflict ? 'merged_accept' : 'accepted',
        reason: mergedOnConflict ? 'stale-client-merged-server-side' : writeReason,
        baseUpdatedAt,
        serverUpdatedAt,
        incomingCount: Array.isArray(body.value) ? body.value.length : null,
        serverCount: key === 'users' && Array.isArray(valueToPersist)
          ? valueToPersist.length
          : (key === 'exhibitions' && Array.isArray(valueToPersist) ? valueToPersist.length : null),
        mergedCount: Array.isArray(valueToPersist) ? valueToPersist.length : null,
        clientId,
        details: key === 'exhibitions'
          ? {
            syncMode: String(body.syncMode || 'full').trim().toLowerCase() === 'delta' ? 'delta' : 'full',
            imageMigration: imageMigrationStats
          }
          : writeDetails
      });

      sendJson(res, 200, {
        ok: true,
        meta: {
          key,
          updatedAt
        },
        mergedOnConflict,
        imageMigration: imageMigrationStats
      });
      return;
    }

    if (req.method === 'DELETE') {
      const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
      const requestId = getRequestId(req);
      const clientId = getClientIdFromRequest(req);
      if (!ALLOWED_KEYS.has(key)) {
        sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions, pottery-students-v1, studio-calendar-state-v1.' });
        return;
      }

      if (key === 'users') {
        await logStateWriteAttempt({
          requestId,
          stateKey: key,
          action: 'DELETE',
          decision: 'rejected',
          reason: 'users-delete-blocked',
          clientId
        });

        sendJson(res, 403, {
          ok: false,
          error: 'Deleting users state is blocked. Remove accounts through users updates instead.'
        });
        return;
      }

      await deleteStateValue(key);
      await logStateWriteAttempt({
        requestId,
        stateKey: key,
        action: 'DELETE',
        decision: 'accepted',
        reason: 'explicit-delete',
        clientId
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || 'Server error' });
  }
};
