function createStateDeleteService(dependencies) {
  return async function handleStateDelete(req, res) {
    const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
    const requestId = dependencies.getRequestId(req);
    const clientId = dependencies.getClientIdFromRequest(req);
    if (!dependencies.allowedKeys.has(key)) {
      dependencies.sendJson(res, 400, { ok: false, error: 'Invalid key. Allowed: users, exhibitions, pottery-students-v1, pottery-personal-work-v1, studio-calendar-state-v1, pottery-material-orders-v1, pottery-accounting-v1.' });
      return;
    }

    if (key === 'users') {
      await dependencies.decisionReporter.audit({
        requestId,
        stateKey: key,
        action: 'DELETE',
        decision: 'rejected',
        reason: 'users-delete-blocked',
        clientId
      });
      dependencies.sendJson(res, 403, {
        ok: false,
        error: 'Deleting users state is blocked. Remove accounts through users updates instead.'
      });
      return;
    }

    await dependencies.deleteStateValue(key);
    await dependencies.decisionReporter.audit({
      requestId,
      stateKey: key,
      action: 'DELETE',
      decision: 'accepted',
      reason: 'explicit-delete',
      clientId
    });
    dependencies.sendJson(res, 200, { ok: true });
  };
}

module.exports = { createStateDeleteService };