const test = require('node:test');
const assert = require('node:assert/strict');

const { exposeClassicScriptFunctions } = require('../helpers/load-source');

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('temporary password is revealed only after the users write is confirmed', async () => {
  const users = [{ id: 2, name: 'Member', username: 'member', password: 'old-password' }];
  const values = new Map([['users', JSON.stringify(users)]]);
  const sync = createDeferred();
  const elements = {
    'temp-password-user-info': { textContent: '' },
    'temp-password-value': { value: '' },
    'temp-password-modal': { style: { display: 'none' } }
  };
  const document = {
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const localStorage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  const window = {
    addEventListener() {},
    location: { href: '' },
    cloudSyncFlushKey(key) {
      assert.equal(key, 'users');
      return sync.promise;
    }
  };
  const harness = exposeClassicScriptFunctions('users.js', ['resetUserPassword'], {
    globals: {
      alert() {},
      confirm() { return true; },
      document,
      localStorage,
      window
    }
  });

  const reset = harness.exposed.resetUserPassword(2);
  assert.equal(elements['temp-password-modal'].style.display, 'none');
  assert.equal(elements['temp-password-value'].value, '');

  sync.resolve(true);
  await reset;

  assert.equal(elements['temp-password-modal'].style.display, 'flex');
  assert.equal(elements['temp-password-value'].value.length, 10);
  assert.notEqual(JSON.parse(values.get('users'))[0].password, 'old-password');
});
