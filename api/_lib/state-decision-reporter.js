function createStateDecisionReporter(dependencies) {
  return Object.freeze({
    async audit(entry) {
      await dependencies.logStateWriteAttempt(entry);
    },
    async conflict(entry) {
      await dependencies.logStateWriteAttempt(entry);
      await dependencies.maybeTriggerConflictSpikeAlert();
    },
    async reject(entry, alert) {
      await dependencies.logStateWriteAttempt(entry);
      await dependencies.recordAlert(alert);
    }
  });
}

module.exports = { createStateDecisionReporter };