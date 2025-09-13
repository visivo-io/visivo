import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";


const DUCKDB_BUNDLES = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_next,
    mainWorker: duckdb_worker,
  },
};

/**
 * 
 * @returns {duckdb.AsyncDuckDB}
 */
export const initDuckDB = async () => {
  const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export const getTempFilename = () => {
  const timestamp = Date.now().toString();
  const randomString = Math.random().toString(36).substring(2);
  return `file-${timestamp}-${randomString}`;
};
