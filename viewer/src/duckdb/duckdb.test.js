// __tests__/initDuckDB.test.js
import * as duckdb from '@duckdb/duckdb-wasm';
import { initDuckDB, duckdbBundle, UNSUPPORTED_BROWSER_MESSAGE } from './duckdb';

global.Worker = class {
  postMessage() {}
  terminate() {}
};

// Mock duckdb
jest.mock('@duckdb/duckdb-wasm', () => {
  return {
    ConsoleLogger: jest.fn(() => ({ log: jest.fn() })),
    VoidLogger: jest.fn(() => ({})),
    AsyncDuckDB: jest.fn().mockImplementation(() => {
      return {
        instantiate: jest.fn().mockResolvedValue(true),
      };
    }),
    getPlatformFeatures: jest.fn().mockResolvedValue({ wasmExceptions: true }),
    PACKAGE_NAME: '@duckdb/duckdb-wasm',
    PACKAGE_VERSION: '9.9.9',
  };
});

describe('initDuckDB', () => {
  afterEach(() => {
    delete window.duckdbFromCdn;
  });

  it('should initialize DuckDB with the EH build and return an AsyncDuckDB instance', async () => {
    const db = await initDuckDB();

    expect(duckdb.VoidLogger).toHaveBeenCalled();
    expect(duckdb.AsyncDuckDB).toHaveBeenCalledWith(expect.any(Object), expect.any(Worker));
    expect(db.instantiate).toHaveBeenCalledWith(duckdbBundle().mainModule);
    expect(db).toBeInstanceOf(Object);
  });

  it('refuses a browser without WebAssembly exception handling, with a message to show', async () => {
    duckdb.getPlatformFeatures.mockResolvedValueOnce({ wasmExceptions: false });
    duckdb.AsyncDuckDB.mockClear();

    await expect(initDuckDB()).rejects.toThrow(UNSUPPORTED_BROWSER_MESSAGE);
    expect(duckdb.AsyncDuckDB).not.toHaveBeenCalled();
  });

  it('loads the pinned jsDelivr build through a same-origin blob worker when asked', async () => {
    window.duckdbFromCdn = true;
    const created = [];
    const RealWorker = global.Worker;
    global.Worker = function MockWorker(url) {
      created.push(url);
      this.postMessage = () => {};
      this.terminate = () => {};
    };
    const createObjectURL = jest.fn(() => 'blob:worker');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    try {
      const db = await initDuckDB();
      const bundle = duckdbBundle();

      expect(bundle.mainModule).toBe(
        'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@9.9.9/dist/duckdb-eh.wasm'
      );
      expect(created).toEqual(['blob:worker']);
      const blob = createObjectURL.mock.calls[0][0];
      const text = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsText(blob);
      });
      expect(text).toBe(`importScripts("${bundle.mainWorker}");`);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:worker');
      expect(db.instantiate).toHaveBeenCalledWith(bundle.mainModule);
    } finally {
      global.Worker = RealWorker;
    }
  });
});

describe('bundle URLs under a deployment root', () => {
  // Vite bakes these in as /assets/..., which is the server root rather than
  // wherever `visivo dist -dr` mounted the bundle. A failed Worker is not a
  // rejected promise, so this went unreported: no error, and no data fetch
  // either, because the insight query is gated on `!!db`. Just a spinner.
  //
  // What is checked here is that duckdb.js routes its URLs through the prefix
  // at all — jest stubs the `?url` imports to a non-absolute placeholder, so
  // the prefixing itself is pinned in config/urls.test.js against real ones.
  const RealWorker = global.Worker;
  let requested;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../config/urls', () => ({
      withDeploymentRoot: url => `/path/sub/${url}`,
    }));
    requested = [];
    global.Worker = function MockWorker(url) {
      requested.push(url);
      this.postMessage = () => {};
      this.terminate = () => {};
    };
  });

  afterEach(() => {
    global.Worker = RealWorker;
    jest.dontMock('../config/urls');
    jest.resetModules();
  });

  const init = async () => {
    const { initDuckDB } = require('./duckdb');
    return initDuckDB();
  };

  it('asks for the worker through the deployment-root prefix', async () => {
    await init();

    expect(requested).toHaveLength(1);
    expect(requested[0].startsWith('/path/sub/')).toBe(true);
  });

  it('passes the wasm module through it too', async () => {
    const db = await init();

    const [mainModule] = db.instantiate.mock.calls.at(-1);
    expect(mainModule.startsWith('/path/sub/')).toBe(true);
  });
});
