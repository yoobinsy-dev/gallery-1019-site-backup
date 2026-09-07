const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimes = {
  'exhibition-detail-runtime.js': [
    'sync/cloud-sync-protocol.js',
    'sync/cloud-sync-model.js',
    'sync/cloud-sync-reconciliation.js',
    'cloud-sync.js',
    'auth.js',
    'storage/storage-adapter.js',
    'storage/exhibitions-repository.js',
    'artworks/repository.js',
    'artworks/identity.js',
    'artworks/exhibition-index.js',
    'artworks/sync-service.js',
      'artworks/work-picker-controller.js',
    'storage/exhibition-detail-repository.js',
    'exhibitions/sales-model.js',
    'exhibitions/accounting-projection.js',
    'exhibitions/export-model.js',
    'exhibitions/snapshot-client.js',
    'exhibitions/detail/backup-controller.js',
    'exhibitions/image-lifecycle.js',
    'exhibitions/certificate-model.js',
    'exhibitions/detail/certificate-controller.js',
    'exhibitions/inventory-model.js',
    'exhibitions/detail/works-editor-controller.js',
      'exhibitions/detail/collection-picker-controller.js',
    'exhibitions/inventory-renderer.js',
    'exhibitions/inventory-backup-model.js',
    'exhibitions/detail/info-controller.js',
    'exhibitions/detail/staff-controller.js',
    'exhibitions/detail/files-controller.js',
    'exhibitions/detail/inventory-state-controller.js',
    'exhibitions/detail/tabs-controller.js',
    'exhibitions/detail/sales-add-controller.js',
    'exhibitions/detail/grid-navigation.js',
    'exhibitions/detail/works-view.js',
    'exhibitions/detail/sales-view-controller.js',
    'exhibitions/detail/accounting-view-controller.js',
    'exhibition-detail.js'
  ],
  'master-calendar-runtime.js': [
    'sync/cloud-sync-protocol.js',
    'sync/cloud-sync-model.js',
    'sync/cloud-sync-reconciliation.js',
    'cloud-sync.js',
    'auth.js',
    'storage/storage-adapter.js',
    'storage/master-calendar-repository.js',
    'master-calendar/date-time.js',
    'master-calendar/occurrences.js',
    'master-calendar/occupancy.js',
    'master-calendar/base-rules.js',
    'master-calendar/base-transaction-controller.js',
    'master-calendar/quick-create-controller.js',
    'master-calendar/schedule-projections.js',
    'master-calendar/state-controller.js',
    'master-calendar/participants-controller.js',
    'master-calendar/commands.js',
    'master-calendar/pointer-controller.js',
    'master-calendar/modal-controller.js',
    'master-calendar/event-modal-controller.js',
    'master-calendar/recurring-event-controller.js',
    'master-calendar/navigation-controller.js',
    'master-calendar/bindings-controller.js',
    'master-calendar/quick-edit-controller.js',
    'master-calendar/base-edit-controller.js',
    'master-calendar/base-editor-controller.js',
    'master-calendar/week-view.js',
    'master-calendar/month-view.js',
    'master-calendar/display-policy.js',
    'pottery-master-calendar.js'
  ]
};

Object.entries(runtimes).forEach(([output, sources]) => {
  const content = sources.map((source) => {
    const body = fs.readFileSync(path.join(root, source), 'utf8');
    return `/* ${source} */\n${body.trim()}\n`;
  }).join('\n');
  fs.writeFileSync(path.join(root, output), `${content}\n`);
  console.log(`Built ${output} from ${sources.length} sources.`);
});
