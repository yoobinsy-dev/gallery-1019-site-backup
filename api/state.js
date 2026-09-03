const { sendJson, methodNotAllowed, readJsonBody } = require('./_lib/http');
const { getStateMap, getStateMetaMap, getStateMapWithMeta, setStateValue, deleteStateValue } = require('./_lib/state-store');
const { logStateWriteAttempt, recordAlert, maybeTriggerConflictSpikeAlert } = require('./_lib/audit-store');
const { buildTransferSafeExhibitions, migrateExhibitionImageReferences } = require('./_lib/exhibition-image-refs');
const { createStateReadService } = require('./_lib/state-read-service');
const { createStateWriteService } = require('./_lib/state-write-service');

const ALLOWED_KEYS = new Set([
  'users',
  'exhibitions',
  'pottery-students-v1',
  'pottery-personal-work-v1',
  'studio-calendar-state-v1',
  'pottery-material-orders-v1',
  'pottery-accounting-v1'
]);
const STRICT_VERSION_KEYS = new Set([
  'users',
  'pottery-students-v1',
  'pottery-personal-work-v1',
  'studio-calendar-state-v1',
  'pottery-material-orders-v1',
  'pottery-accounting-v1'
]);
const HARD_DROP_MIN_PREVIOUS_TOTAL = 20;
const HARD_DROP_MIN_ABSOLUTE = 15;
const HARD_DROP_RATIO = 0.7;
const USER_DROP_MIN_PREVIOUS_TOTAL = 3;
const USER_DROP_MIN_ABSOLUTE = 2;
const USER_DROP_RATIO = 0.5;

const handleStateRead = createStateReadService({
  allowedKeys: ALLOWED_KEYS,
  buildTransferSafeExhibitions,
  getStateMap,
  getStateMetaMap,
  sendJson
});

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

  const paymentRecords = mergeByIdentityArray(
    currentStudent.paymentRecords,
    incomingStudent.paymentRecords,
    (record) => {
      const id = String(record?.id || '').trim();
      if (id) return `id:${id}`;
      const date = String(record?.date || '').trim();
      return date ? `date:${date}` : '';
    }
  );
  const paymentHistory = paymentRecords.length
    ? mergeStringArrayUnique([], paymentRecords.map((record) => record?.date))
    : mergeStringArrayUnique(currentStudent.paymentHistory, incomingStudent.paymentHistory);

  return {
    ...currentStudent,
    ...incomingStudent,
    paymentHistory,
    paymentRecords
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

  // Calendar state writes are full snapshots from clients.
  // Prefer incoming collections to preserve explicit deletions.
  const events = Array.isArray(incoming.events)
    ? incoming.events
    : (Array.isArray(current.events) ? current.events : []);
  const baseRules = Array.isArray(incoming.baseRules)
    ? incoming.baseRules
    : (Array.isArray(current.baseRules) ? current.baseRules : []);
  const baseRuleTimeline = Array.isArray(incoming.baseRuleTimeline)
    ? incoming.baseRuleTimeline
    : (Array.isArray(current.baseRuleTimeline) ? current.baseRuleTimeline : []);
  const baseWeekOverrides = incoming.baseWeekOverrides && typeof incoming.baseWeekOverrides === 'object'
    ? incoming.baseWeekOverrides
    : (current.baseWeekOverrides && typeof current.baseWeekOverrides === 'object' ? current.baseWeekOverrides : {});
  const studioUsers = Array.isArray(incoming.studioUsers)
    ? incoming.studioUsers
    : (Array.isArray(current.studioUsers) ? current.studioUsers : []);
  const classTeachingLog = Array.isArray(incoming.classTeachingLog)
    ? incoming.classTeachingLog
    : (Array.isArray(current.classTeachingLog) ? current.classTeachingLog : []);
  const instructors = Array.isArray(incoming.instructors)
    ? incoming.instructors
    : (Array.isArray(current.instructors) ? current.instructors : []);

  return {
    ...current,
    ...incoming,
    events,
    baseRules,
    baseRuleTimeline,
    baseWeekOverrides,
    studioUsers,
    classTeachingLog,
    instructors
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

const handleStateWrite = createStateWriteService({
  allowedKeys: ALLOWED_KEYS,
  strictVersionKeys: STRICT_VERSION_KEYS,
  readJsonBody,
  sendJson,
  getStateMap,
  getStateMapWithMeta,
  setStateValue,
  logStateWriteAttempt,
  recordAlert,
  maybeTriggerConflictSpikeAlert,
  migrateExhibitionImageReferences,
  policies: {
    detectLargeUnexpectedInventoryDrop,
    detectSuspiciousUserDrop,
    getClientIdFromRequest,
    getRequestId,
    hasAtLeastOneAdminWithPassword,
    hasKnownServerVersion,
    hasUsersWithMissingPasswords,
    isStaleComparedToServer,
    mergeExhibitionsState,
    mergeExhibitionsStatePreferServerOnConflict,
    mergeStudentsState,
    mergeStudioCalendarState,
    mergeUsersWithDelta
  }
});

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await handleStateRead(req, res);
      return;
    }

    if (req.method === 'PUT') {
      await handleStateWrite(req, res);
      return;
    }

    if (req.method === 'DELETE') {
      const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
      const requestId = getRequestId(req);
      const clientId = getClientIdFromRequest(req);
      if (!ALLOWED_KEYS.has(key)) {
        sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions, pottery-students-v1, pottery-personal-work-v1, studio-calendar-state-v1, pottery-material-orders-v1, pottery-accounting-v1.' });
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
