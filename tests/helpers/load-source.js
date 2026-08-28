const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');

function createBrowserSandbox(overrides = {}) {
  const listeners = new Map();
  const storage = new Map();
  const document = {
    addEventListener(type, listener) {
      const values = listeners.get(type) || [];
      values.push(listener);
      listeners.set(type, values);
    },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { classList: { add() {}, remove() {}, toggle() {} } }
  };
  const window = {
    addEventListener(type, listener) {
      const values = listeners.get(type) || [];
      values.push(listener);
      listeners.set(type, values);
    },
    location: { href: '', search: '' },
    cloudSyncReady: Promise.resolve(null),
    cloudSyncStatus: { ready: true, remoteReachable: false }
  };
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
    clear() { storage.clear(); }
  };
  const sandbox = {
    console,
    Buffer,
    Date,
    Map,
    Set,
    Promise,
    URL,
    clearInterval,
    clearTimeout,
    setInterval,
    setTimeout,
    alert() {},
    confirm() { return true; },
    document,
    localStorage,
    window,
    ...overrides
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = document;
  sandbox.window.localStorage = localStorage;
  return { sandbox, listeners, storage };
}

function exposeIifeFunctions(relativePath, names, options = {}) {
  const filename = path.join(ROOT, relativePath);
  const original = fs.readFileSync(filename, 'utf8');
  const marker = original.lastIndexOf('})();');
  if (marker === -1) {
    throw new Error(`${relativePath} does not end with the expected IIFE marker.`);
  }
  const bindings = names.map((name) => `${JSON.stringify(name)}: ${name}`).join(',\n');
  const probe = `\n;globalThis.__characterization = {\n${bindings}\n};\n`;
  const source = `${original.slice(0, marker)}${probe}${original.slice(marker)}`;
  const context = createBrowserSandbox(options.globals);
  vm.runInNewContext(source, context.sandbox, { filename });
  return { ...context, exposed: context.sandbox.__characterization };
}

function exposeClassicScriptFunctions(relativePath, names, options = {}) {
  const filename = path.join(ROOT, relativePath);
  const original = fs.readFileSync(filename, 'utf8');
  const bindings = names.map((name) => `${JSON.stringify(name)}: ${name}`).join(',\n');
  const source = `${original}\n;globalThis.__characterization = {\n${bindings}\n};\n`;
  const context = createBrowserSandbox(options.globals);
  vm.runInNewContext(source, context.sandbox, { filename });
  return { ...context, exposed: context.sandbox.__characterization };
}

function loadCommonJsWithMocks(relativePath, mocks = {}, exposeNames = []) {
  const filename = path.join(ROOT, relativePath);
  let source = fs.readFileSync(filename, 'utf8');
  if (exposeNames.length > 0) {
    const bindings = exposeNames.map((name) => `${JSON.stringify(name)}: ${name}`).join(',\n');
    source += `\nmodule.exports.__characterization = {\n${bindings}\n};\n`;
  }

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return Module._load(request, loaded, false);
  };
  loaded._compile(source, filename);
  return loaded.exports;
}

module.exports = {
  ROOT,
  createBrowserSandbox,
  exposeClassicScriptFunctions,
  exposeIifeFunctions,
  loadCommonJsWithMocks
};