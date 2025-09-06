// __tests__/initDuckDB.test.js
import * as duckdb from "@duckdb/duckdb-wasm";
import { initDuckDB } from "./duckdb";

global.Worker = class {
  constructor() {}
  postMessage() {}
  terminate() {}
};

// Mock duckdb
jest.mock("@duckdb/duckdb-wasm", () => {
  return {
    ConsoleLogger: jest.fn(() => ({ log: jest.fn() })),
    AsyncDuckDB: jest.fn().mockImplementation(() => {
      return {
        instantiate: jest.fn().mockResolvedValue(true),
      };
    }),
    selectBundle: jest.fn().mockResolvedValue({
      mainModule: "mockModule",
      mainWorker: "mockWorker.js",
    }),
  };
});

describe("initDuckDB", () => {
  it("should initialize DuckDB and return an AsyncDuckDB instance", async () => {
    const db = await initDuckDB();

    // Assertions
    expect(duckdb.selectBundle).toHaveBeenCalled();
    expect(duckdb.ConsoleLogger).toHaveBeenCalled();
    expect(duckdb.AsyncDuckDB).toHaveBeenCalledWith(expect.any(Object), expect.any(Worker));
    expect(db.instantiate).toHaveBeenCalledWith("mockModule", undefined);

    expect(db).toBeInstanceOf(Object);
  });
});
