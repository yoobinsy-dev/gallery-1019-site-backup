const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeIifeFunctions } = require('../helpers/load-source');
const CloudSyncModel = require('../../sync/cloud-sync-model');
const CloudSyncProtocol = require('../../sync/cloud-sync-protocol');

const SYNCED_KEYS = [
  'users',
  'exhibitions',
  'pottery-students-v1',
  'pottery-personal-work-v1',
  'studio-calendar-state-v1',
  'pottery-material-orders-v1',
  'pottery-accounting-v1'
];

function createCloudSyncHarness({
  pathname = '/login.html',
  initialLocal = {},
  initialSession = {},
  respond
} = {}) {
  class TestStorage {
    constructor(initial = {}) {
      this.values = new Map(Object.entries(initial));
    }

    getItem(key) {
      return this.values.has(String(key)) ? this.values.get(String(key)) : null;
    }

    setItem(key, value) {
      this.values.set(String(key), String(value));
    }

    removeItem(key) {
      this.values.delete(String(key));
    }
  }

  class TestCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const localStorage = new TestStorage(initialLocal);
  const sessionStorage = new TestStorage(initialSession);
  const fetchCalls = [];
  const events = [];
  const timers = new Map();
  let nextTimerId = 1;

  const fetch = async (url, options = {}) => {
    const call = { url, options };
    fetchCalls.push(call);
    return respond
      ? respond(call, fetchCalls.length - 1)
      : {
          ok: true,
          status: 200,
          headers: { get() { return null; } },
          async json() { return { ok: true, data: {}, meta: {} }; }
        };
  };

  const window = {
    location: { pathname, protocol: 'https:' },
    dispatchEvent(event) {
      events.push(event);
      return true;
    }
  };

  exposeIifeFunctions('cloud-sync.js', [], {
    globals: {
      CustomEvent: TestCustomEvent,
      CloudSyncModel,
      CloudSyncProtocol,
      Storage: TestStorage,
      fetch,
      localStorage,
      sessionStorage,
      window,
      setTimeout(callback) {
        const id = nextTimerId;
        nextTimerId += 1;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
      crypto: { randomUUID() { return 'test-client-id'; } }
    }
  });

  return {
    events,
    fetchCalls,
    localStorage,
    sessionStorage,
    timers,
    window
  };
}

function response({ status = 200, body = { ok: true, data: {}, meta: {} }, etag = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'etag' ? etag : null;
      }
    },
    async json() { return body; }
  };
}

test('cloud sync characterizes the page-to-active-key request matrix', async () => {
  const cases = [
    ['/login.html', ['users']],
    ['/users.html', ['users']],
    ['/pottery-master-calendar.html', ['users', 'pottery-personal-work-v1', 'studio-calendar-state-v1']],
    ['/pottery-personal-work.html', ['users', 'pottery-personal-work-v1', 'studio-calendar-state-v1']],
    ['/pottery-material-orders.html', ['users', 'pottery-material-orders-v1']],
    ['/pottery-students.html', ['users', 'pottery-students-v1', 'studio-calendar-state-v1']],
    ['/pottery-accounting.html', SYNCED_KEYS],
    ['/gallery-lounge.html', []],
    ['/inventory.html', []],
    ['/exhibitions.html', ['exhibitions']],
    ['/exhibition-detail.html', ['users', 'exhibitions']],
    ['/unknown.html', SYNCED_KEYS]
  ];

  for (const [pathname, expectedKeys] of cases) {
    const harness = createCloudSyncHarness({ pathname });
    const status = await harness.window.cloudSyncReady;

    assert.deepEqual(Array.from(status.activeKeys), expectedKeys, pathname);
    assert.equal(status.ready, true, pathname);
    if (expectedKeys.length === 0) {
      assert.equal(harness.fetchCalls.length, 0, pathname);
    } else {
      assert.equal(harness.fetchCalls.length, 1, pathname);
      assert.equal(
        harness.fetchCalls[0].url,
        `/api/state?keys=${encodeURIComponent(expectedKeys.join(','))}`,
        pathname
      );
    }
  }
});

test('cloud sync model characterizes users and exhibitions delta removals', () => {
  const previousUsers = [
    { id: 1, username: 'admin', role: 'admin' },
    { id: 2, username: 'member', role: 'member' }
  ];
  const nextUsers = [{ id: 1, username: 'admin', role: 'manager' }];
  const previousExhibitions = [{ id: 10, title: 'Keep' }, { id: 11, title: 'Remove' }];
  const nextExhibitions = [{ id: 10, title: 'Changed' }];

  assert.deepEqual(CloudSyncModel.buildUsersDelta(previousUsers, nextUsers), {
    changed: nextUsers,
    removedIds: [2]
  });
  assert.deepEqual(CloudSyncModel.buildExhibitionsDelta(previousExhibitions, nextExhibitions), {
    changed: nextExhibitions,
    removedIds: [11]
  });
  assert.equal(previousUsers[0].role, 'admin');
  assert.equal(previousExhibitions[0].title, 'Keep');
});

test('cloud sync applies remote startup state without echo before signaling ready', async () => {
  const updatedAt = '2026-08-30T12:00:00.000Z';
  const remoteUsers = [{ id: 1, username: 'admin', role: 'admin' }];
  const harness = createCloudSyncHarness({
    respond() {
      return response({
        etag: '"users-v1"',
        body: {
          ok: true,
          data: { users: remoteUsers },
          meta: { users: { updatedAt } }
        }
      });
    }
  });

  const status = await harness.window.cloudSyncReady;

  assert.equal(harness.localStorage.getItem('users'), JSON.stringify(remoteUsers));
  assert.deepEqual(JSON.parse(harness.localStorage.getItem('__sync_updated_at__')), { users: updatedAt });
  assert.deepEqual(JSON.parse(harness.localStorage.getItem('__sync_remote_updated_at__')), { users: updatedAt });
  assert.deepEqual(JSON.parse(harness.sessionStorage.getItem('__cloud_sync_state_pull_etags__')), {
    users: '"users-v1"'
  });
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.timers.size, 0);
  assert.deepEqual(harness.events.map((event) => event.type), [
    'cloud-sync:state-applied',
    'cloud-sync:ready'
  ]);
  assert.deepEqual(Array.from(harness.events[0].detail.keys), ['users']);
  assert.equal(status.remoteReachable, true);
  assert.deepEqual(Array.from(status.appliedRemoteKeys), ['users']);
  assert.equal(status.hadRemoteData.users, true);
});

test('cloud sync merges material orders and repairs both local and remote state', async () => {
  const key = 'pottery-material-orders-v1';
  const localOrders = [{
    id: 'order-1',
    updatedAt: '2026-08-30T10:02:00.000Z',
    supplier: 'Local supplier',
    items: [{ id: 'clay', quantity: 2 }]
  }];
  const remoteOrders = [{
    id: 'order-1',
    updatedAt: '2026-08-30T10:01:00.000Z',
    supplier: 'Remote supplier',
    items: [{ id: 'glaze', quantity: 1 }]
  }];
  const harness = createCloudSyncHarness({
    pathname: '/pottery-material-orders.html',
    initialLocal: { [key]: JSON.stringify(localOrders) },
    respond(call) {
      if (!call.options.method) {
        return response({
          body: {
            ok: true,
            data: { users: [], [key]: remoteOrders },
            meta: { [key]: { updatedAt: '2026-08-30T10:03:00.000Z' } }
          }
        });
      }
      return response();
    }
  });

  const status = await harness.window.cloudSyncReady;
  const reconciled = JSON.parse(harness.localStorage.getItem(key));

  assert.equal(reconciled[0].supplier, 'Local supplier');
  assert.deepEqual(reconciled[0].items, [
    { id: 'clay', quantity: 2 },
    { id: 'glaze', quantity: 1 }
  ]);
  assert.deepEqual(Array.from(status.appliedRemoteKeys), ['users', key]);
  assert.equal(harness.timers.size, 1);

  const [runRepair] = harness.timers.values();
  await runRepair();
  assert.deepEqual(JSON.parse(harness.fetchCalls[1].options.body), {
    key,
    value: reconciled,
    baseUpdatedAt: null,
    syncMode: 'full'
  });
});

test('cloud sync preserves local exhibition previews while applying and healing newer remote state', async () => {
  const localExhibitions = [{
    id: 10,
    title: 'Local title',
    artWorks: [{ id: 101, title: 'Vase', photoPreviewDataUrl: 'data:image/jpeg;base64,preview' }]
  }];
  const remoteExhibitions = [{
    id: 10,
    title: 'Remote title',
    artWorks: [{ id: 101, title: 'Vase' }]
  }];
  const harness = createCloudSyncHarness({
    pathname: '/exhibitions.html',
    initialLocal: {
      exhibitions: JSON.stringify(localExhibitions),
      __sync_updated_at__: JSON.stringify({ exhibitions: '2026-08-30T10:00:00.000Z' })
    },
    respond(call) {
      if (!call.options.method) {
        return response({
          body: {
            ok: true,
            data: { exhibitions: remoteExhibitions },
            meta: { exhibitions: { updatedAt: '2026-08-30T10:01:00.000Z' } }
          }
        });
      }
      return response();
    }
  });

  await harness.window.cloudSyncReady;
  const applied = JSON.parse(harness.localStorage.getItem('exhibitions'));

  assert.equal(applied[0].title, 'Remote title');
  assert.equal(applied[0].artWorks[0].photoPreviewDataUrl, 'data:image/jpeg;base64,preview');
  assert.equal(harness.timers.size, 1);
});

test('cloud sync rejects a suspicious remote exhibition inventory drop', async () => {
  const localWorks = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
  const localExhibitions = [{ id: 10, artWorks: localWorks, goods: [] }];
  const remoteExhibitions = [{ id: 10, artWorks: [], goods: [] }];
  const harness = createCloudSyncHarness({
    pathname: '/exhibitions.html',
    initialLocal: { exhibitions: JSON.stringify(localExhibitions) },
    respond(call) {
      if (!call.options.method) {
        return response({
          body: {
            ok: true,
            data: { exhibitions: remoteExhibitions },
            meta: { exhibitions: { updatedAt: '2026-08-30T10:01:00.000Z' } }
          }
        });
      }
      return response();
    }
  });

  const status = await harness.window.cloudSyncReady;

  assert.deepEqual(JSON.parse(harness.localStorage.getItem('exhibitions')), localExhibitions);
  assert.deepEqual(Array.from(status.appliedRemoteKeys), []);
  assert.equal(harness.timers.size, 1);
});

test('cloud sync intercepts users writes as one debounced delta push', async () => {
  const baseline = [
    { id: 1, username: 'admin', role: 'admin' },
    { id: 2, username: 'member', role: 'member' }
  ];
  const next = [
    { id: 1, username: 'admin', role: 'admin' },
    { id: 2, username: 'member', role: 'manager' }
  ];
  const remoteUpdatedAt = '2026-08-30T10:00:00.000Z';
  const savedAt = '2026-08-30T10:01:00.000Z';
  const harness = createCloudSyncHarness({
    initialLocal: { users: JSON.stringify(baseline) },
    initialSession: {
      __sync_remote_updated_at_session__: JSON.stringify({ users: remoteUpdatedAt })
    },
    respond(call) {
      if (!call.options.method) return response({ status: 304 });
      return response({ body: { ok: true, meta: { key: 'users', updatedAt: savedAt } } });
    }
  });
  await harness.window.cloudSyncReady;

  harness.localStorage.setItem('users', JSON.stringify(next));
  harness.localStorage.setItem('users', JSON.stringify(next));

  assert.equal(harness.timers.size, 1);
  const localMeta = JSON.parse(harness.localStorage.getItem('__sync_updated_at__'));
  assert.match(localMeta.users, /^\d{4}-\d{2}-\d{2}T/);

  const [runPush] = harness.timers.values();
  await runPush();

  assert.equal(harness.fetchCalls.length, 2);
  const push = harness.fetchCalls[1];
  assert.equal(push.url, '/api/state');
  assert.equal(push.options.method, 'PUT');
  assert.equal(push.options.headers['x-cloud-client-id'], 'test-client-id');
  assert.deepEqual(JSON.parse(push.options.body), {
    key: 'users',
    value: [{ id: 2, username: 'member', role: 'manager' }],
    baseUpdatedAt: remoteUpdatedAt,
    syncMode: 'delta',
    removedIds: []
  });
  assert.deepEqual(JSON.parse(harness.localStorage.getItem('__sync_updated_at__')), { users: savedAt });
  assert.deepEqual(JSON.parse(harness.localStorage.getItem('__sync_remote_updated_at__')), { users: savedAt });
});

test('cloud sync revalidates cached pulls and finalizes a 304 without applying state', async () => {
  const harness = createCloudSyncHarness({
    initialSession: {
      __cloud_sync_state_pull_etags__: JSON.stringify({ users: '"users-v1"' })
    },
    respond() {
      return response({ status: 304 });
    }
  });

  const status = await harness.window.cloudSyncReady;

  assert.equal(harness.fetchCalls[0].options.headers['If-None-Match'], '"users-v1"');
  assert.equal(status.remoteReachable, true);
  assert.deepEqual(Array.from(status.appliedRemoteKeys), []);
  assert.deepEqual(harness.events.map((event) => event.type), ['cloud-sync:ready']);
  assert.equal(harness.localStorage.getItem('users'), null);
});

test('cloud sync preserves inactive and unchanged writes and maps enabled removal to DELETE', async () => {
  const users = [{ id: 1, username: 'admin' }];
  const harness = createCloudSyncHarness({
    initialLocal: { users: JSON.stringify(users) },
    respond() {
      return response({ status: 304 });
    }
  });
  await harness.window.cloudSyncReady;

  harness.localStorage.setItem('exhibitions', '[{"id":1}]');
  harness.localStorage.setItem('users', JSON.stringify(users));

  assert.equal(harness.localStorage.getItem('exhibitions'), '[{"id":1}]');
  assert.equal(harness.localStorage.getItem('__sync_updated_at__'), null);
  assert.equal(harness.timers.size, 0);

  harness.localStorage.removeItem('users');
  assert.equal(harness.localStorage.getItem('users'), null);
  assert.equal(harness.timers.size, 1);

  const [runDelete] = harness.timers.values();
  await runDelete();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.fetchCalls[1].url, '/api/state?key=users');
  assert.equal(harness.fetchCalls[1].options.method, 'DELETE');
  assert.match(
    JSON.parse(harness.localStorage.getItem('__sync_updated_at__')).users,
    /^\d{4}-\d{2}-\d{2}T/
  );
});

test('cloud sync sends non-delta keys as parsed full payloads', async () => {
  const remoteUpdatedAt = '2026-08-30T10:00:00.000Z';
  const calendar = { events: [{ id: 'event-1', title: 'Class' }], unknownField: true };
  const harness = createCloudSyncHarness({
    pathname: '/pottery-master-calendar.html',
    initialSession: {
      __sync_remote_updated_at_session__: JSON.stringify({
        'studio-calendar-state-v1': remoteUpdatedAt
      })
    },
    respond(call) {
      if (!call.options.method) return response({ status: 304 });
      return response({
        body: {
          ok: true,
          meta: { key: 'studio-calendar-state-v1', updatedAt: '2026-08-30T10:01:00.000Z' }
        }
      });
    }
  });
  await harness.window.cloudSyncReady;

  harness.localStorage.setItem('studio-calendar-state-v1', JSON.stringify(calendar));
  const [runPush] = harness.timers.values();
  await runPush();

  assert.deepEqual(JSON.parse(harness.fetchCalls[1].options.body), {
    key: 'studio-calendar-state-v1',
    value: calendar,
    baseUpdatedAt: remoteUpdatedAt,
    syncMode: 'full'
  });
});

test('cloud sync follows 409 and 422 push responses with an immediate pull', async () => {
  for (const rejectedStatus of [409, 422]) {
    const baseline = [{ id: 1, username: 'admin', role: 'admin' }];
    const next = [{ id: 1, username: 'admin', role: 'manager' }];
    const harness = createCloudSyncHarness({
      initialLocal: { users: JSON.stringify(baseline) },
      respond(call, index) {
        if (index === 0) return response({ status: 304 });
        if (call.options.method === 'PUT') return response({ status: rejectedStatus });
        return response();
      }
    });
    await harness.window.cloudSyncReady;

    harness.localStorage.setItem('users', JSON.stringify(next));
    const [runPush] = harness.timers.values();
    await runPush();

    assert.equal(harness.fetchCalls.length, 3, String(rejectedStatus));
    assert.equal(harness.fetchCalls[0].options.method, undefined, String(rejectedStatus));
    assert.equal(harness.fetchCalls[1].options.method, 'PUT', String(rejectedStatus));
    assert.equal(harness.fetchCalls[2].options.method, undefined, String(rejectedStatus));
    assert.equal(
      harness.fetchCalls[2].url,
      '/api/state?keys=users',
      String(rejectedStatus)
    );
    assert.deepEqual(
      harness.events.map((event) => event.type),
      ['cloud-sync:ready'],
      String(rejectedStatus)
    );
  }
});