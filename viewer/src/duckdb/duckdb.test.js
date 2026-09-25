// __tests__/initDuckDB.test.js
import * as duckdb from '@duckdb/duckdb-wasm';
import { initDuckDB } from './duckdb';

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
    selectBundle: jest.fn().mockResolvedValue({
      mainModule: 'mockModule',
      mainWorker: 'mockWorker.js',
    }),
  };
});

describe('initDuckDB', () => {
  it('should initialize DuckDB and return an AsyncDuckDB instance', async () => {
    const db = await initDuckDB();

    // Assertions
    expect(duckdb.selectBundle).toHaveBeenCalled();
    expect(duckdb.VoidLogger).toHaveBeenCalled();
    expect(duckdb.AsyncDuckDB).toHaveBeenCalledWith(expect.any(Object), expect.any(Worker));
    expect(db.instantiate).toHaveBeenCalledWith('mockModule', undefined);

    expect(db).toBeInstanceOf(Object);
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
    const duckdbWasm = require('@duckdb/duckdb-wasm');
    duckdbWasm.selectBundle.mockImplementation(async bundles => bundles.eh);
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
