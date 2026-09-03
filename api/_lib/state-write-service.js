function createStateWriteService(dependencies) {
  const {
    allowedKeys,
    strictVersionKeys,
    readJsonBody,
    sendJson,
    getStateMap,
    getStateMapWithMeta,
    setStateValue,
    logStateWriteAttempt,
    recordAlert,
    maybeTriggerConflictSpikeAlert,
    migrateExhibitionImageReferences,
    policies
  } = dependencies;

  return async function handleStateWrite(req, res) {
    const body = await readJsonBody(req);
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    const baseUpdatedAt = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt.trim() : '';
    const requestId = policies.getRequestId(req);
    const clientId = policies.getClientIdFromRequest(req);

    if (!allowedKeys.has(key)) {
      sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions, pottery-students-v1, pottery-personal-work-v1, studio-calendar-state-v1, pottery-material-orders-v1, pottery-accounting-v1.' });
      return;
    }

    const { meta: currentMeta } = await getStateMapWithMeta([key]);
    const serverUpdatedAt = currentMeta?.[key]?.updatedAt || '';

    if (strictVersionKeys.has(key) && policies.hasKnownServerVersion(serverUpdatedAt) && !baseUpdatedAt) {
      await logStateWriteAttempt({ requestId, stateKey: key, action: 'PUT', decision: 'conflict_rejected', reason: 'missing-client-base-version', baseUpdatedAt, serverUpdatedAt, clientId });
      await maybeTriggerConflictSpikeAlert();
      sendJson(res, 409, { ok: false, error: 'State conflict: missing client base version for users data.', conflict: { key, serverUpdatedAt, baseUpdatedAt: null } });
      return;
    }

    if (strictVersionKeys.has(key) && policies.isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt)) {
      await logStateWriteAttempt({ requestId, stateKey: key, action: 'PUT', decision: 'conflict_rejected', reason: 'server-newer-than-client-base', baseUpdatedAt, serverUpdatedAt, clientId });
      await maybeTriggerConflictSpikeAlert();
      sendJson(res, 409, { ok: false, error: 'State conflict: server has newer users data.', conflict: { key, serverUpdatedAt, baseUpdatedAt: baseUpdatedAt || null } });
      return;
    }

    let valueToPersist = body.value;
    let mergedOnConflict = false;
    let imageMigrationStats = null;
    let writeReason = 'normal-write';
    let writeDetails;

    if (key === 'users' && Array.isArray(body.value)) {
      const existingMap = await getStateMap(['users']);
      const currentUsers = Array.isArray(existingMap.users) ? existingMap.users : [];
      const syncMode = normalizeSyncMode(body.syncMode);
      const removedIds = Array.isArray(body.removedIds)
        ? body.removedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : [];
      valueToPersist = policies.mergeUsersWithDelta(currentUsers, body.value, removedIds);
      writeReason = syncMode === 'delta' ? 'users-delta-merged' : 'users-full-merged-with-guards';

      const blockedDrop = policies.detectSuspiciousUserDrop(currentUsers, valueToPersist, removedIds);
      if (blockedDrop) {
        await logStateWriteAttempt({
          requestId, stateKey: key, action: 'PUT', decision: 'drop_blocked',
          reason: 'large-unexpected-user-drop-without-explicit-removals',
          baseUpdatedAt, serverUpdatedAt, incomingCount: body.value.length,
          serverCount: currentUsers.length, mergedCount: valueToPersist.length, clientId,
          details: { ...blockedDrop, syncMode }
        });
        await recordAlert({ alertType: 'large-user-drop-blocked', severity: 'critical', message: `Blocked suspicious user drop from ${blockedDrop.previousCount} to ${blockedDrop.nextCount}.`, details: blockedDrop });
        sendJson(res, 422, { ok: false, error: 'Blocked suspicious user account drop. Retry with explicit removals from a fresh client state.', blocked: blockedDrop });
        return;
      }

      if (policies.hasUsersWithMissingPasswords(valueToPersist)) {
        const details = { syncMode, removedIdsCount: removedIds.length };
        await logStateWriteAttempt({
          requestId, stateKey: key, action: 'PUT', decision: 'rejected',
          reason: 'users-missing-password-after-merge', baseUpdatedAt, serverUpdatedAt,
          incomingCount: body.value.length, serverCount: currentUsers.length,
          mergedCount: valueToPersist.length, clientId, details
        });
        await recordAlert({ alertType: 'users-missing-password-rejected', severity: 'critical', message: 'Rejected users write because one or more accounts had missing passwords after merge.', details });
        sendJson(res, 422, { ok: false, error: 'Rejected users write: one or more accounts would have missing passwords.' });
        return;
      }

      if (!policies.hasAtLeastOneAdminWithPassword(valueToPersist)) {
        const details = { syncMode, removedIdsCount: removedIds.length };
        await logStateWriteAttempt({
          requestId, stateKey: key, action: 'PUT', decision: 'rejected',
          reason: 'users-missing-admin-with-password', baseUpdatedAt, serverUpdatedAt,
          incomingCount: body.value.length, serverCount: currentUsers.length,
          mergedCount: valueToPersist.length, clientId, details
        });
        await recordAlert({ alertType: 'users-admin-invariant-rejected', severity: 'critical', message: 'Rejected users write because no admin account with password would remain.', details });
        sendJson(res, 422, { ok: false, error: 'Rejected users write: at least one admin account with password must remain.' });
        return;
      }
      writeDetails = { syncMode, removedIdsCount: removedIds.length };
    }

    if (key === 'pottery-students-v1' && Array.isArray(body.value)) {
      const existingMap = await getStateMap(['pottery-students-v1']);
      const currentStudents = Array.isArray(existingMap['pottery-students-v1']) ? existingMap['pottery-students-v1'] : [];
      valueToPersist = policies.mergeStudentsState(currentStudents, body.value);
      writeReason = 'pottery-students-merged';
    }

    if (key === 'studio-calendar-state-v1' && body.value && typeof body.value === 'object') {
      const existingMap = await getStateMap(['studio-calendar-state-v1']);
      const currentCalendar = existingMap['studio-calendar-state-v1'] && typeof existingMap['studio-calendar-state-v1'] === 'object'
        ? existingMap['studio-calendar-state-v1']
        : {};
      valueToPersist = policies.mergeStudioCalendarState(currentCalendar, body.value);
      writeReason = 'studio-calendar-full-overwrite';
    }

    if (key === 'exhibitions') {
      const existingMap = await getStateMap(['exhibitions']);
      const currentExhibitions = Array.isArray(existingMap.exhibitions) ? existingMap.exhibitions : [];
      const syncMode = normalizeSyncMode(body.syncMode);
      const incomingExhibitions = Array.isArray(body.value) ? body.value : [];
      const staleConflict = policies.isStaleComparedToServer(baseUpdatedAt, serverUpdatedAt);

      if (syncMode === 'delta' && incomingExhibitions.length === 0) {
        await logStateWriteAttempt({ requestId, stateKey: key, action: 'PUT', decision: 'accepted', reason: 'delta-noop', baseUpdatedAt, serverUpdatedAt, incomingCount: 0, serverCount: currentExhibitions.length, mergedCount: currentExhibitions.length, clientId, details: { syncMode } });
        sendJson(res, 200, { ok: true, meta: { key, updatedAt: serverUpdatedAt || null }, mergedOnConflict: false });
        return;
      }

      const touchedIds = syncMode === 'delta'
        ? new Set(incomingExhibitions.map((item) => Number(item?.id)).filter((id) => Number.isFinite(id) && id > 0))
        : null;
      const blockedDrop = policies.detectLargeUnexpectedInventoryDrop(currentExhibitions, incomingExhibitions, { onlyTouchedIds: touchedIds, treatMissingAsZero: syncMode !== 'delta' });
      if (blockedDrop) {
        await logStateWriteAttempt({
          requestId, stateKey: key, action: 'PUT', decision: 'drop_blocked',
          reason: 'large-unexpected-inventory-drop-without-marker', baseUpdatedAt,
          serverUpdatedAt, incomingCount: incomingExhibitions.length,
          serverCount: currentExhibitions.length, mergedCount: currentExhibitions.length,
          clientId, details: { ...blockedDrop, syncMode }
        });
        await recordAlert({ alertType: 'large-drop-blocked', severity: 'critical', message: `Blocked large inventory drop for exhibition ${blockedDrop.exhibitionId}.`, details: blockedDrop });
        sendJson(res, 422, { ok: false, error: 'Blocked suspicious large inventory drop. Add explicit clear marker to allow this reset.', blocked: blockedDrop });
        return;
      }

      mergedOnConflict = staleConflict;
      valueToPersist = staleConflict
        ? policies.mergeExhibitionsStatePreferServerOnConflict(currentExhibitions, incomingExhibitions)
        : policies.mergeExhibitionsState(currentExhibitions, incomingExhibitions);
      const configuredMaxUploads = Number(process.env.EXHIBITION_IMAGE_MIGRATION_MAX_UPLOADS);
      const migration = await migrateExhibitionImageReferences(valueToPersist, { maxUploads: Number.isFinite(configuredMaxUploads) ? configuredMaxUploads : 0 });
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
        ? { syncMode: normalizeSyncMode(body.syncMode), imageMigration: imageMigrationStats }
        : writeDetails
    });
    sendJson(res, 200, { ok: true, meta: { key, updatedAt }, mergedOnConflict, imageMigration: imageMigrationStats });
  };
}

function normalizeSyncMode(value) {
  return String(value || 'full').trim().toLowerCase() === 'delta' ? 'delta' : 'full';
}

module.exports = { createStateWriteService };