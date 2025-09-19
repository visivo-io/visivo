import * as queries from './queries';
import { insertDuckDBFile, runDuckDBQuery } from './queries';

jest.mock('@duckdb/duckdb-wasm', () => {
  return {
    DuckDBDataProtocol: {
      BROWSER_FILEREADER: 'BROWSER_FILEREADER',
    },
    AsyncDuckDB: jest.fn(),
  };
});

// Fake connection object
const mockConn = {
  query: jest.fn().mockResolvedValue('mock-result'),
  close: jest.fn().mockResolvedValue(undefined),
  insertCSVFromPath: jest.fn().mockResolvedValue(undefined),
};

// Fake DB object
const makeMockDB = () => ({
  connect: jest.fn().mockResolvedValue(mockConn),
  registerFileHandle: jest.fn().mockResolvedValue(undefined),
  registerFileText: jest.fn().mockResolvedValue(undefined),
  dropFile: jest.fn().mockResolvedValue(undefined),
});

let db;
beforeEach(() => {
  db = makeMockDB();
  jest.spyOn(queries, 'runDuckDBQuery');
});

it('executes query and closes connection', async () => {
  const result = await runDuckDBQuery(db, 'SELECT 1');

  expect(db.connect).toHaveBeenCalled();
  expect(mockConn.query).toHaveBeenCalledWith('SELECT 1');
  expect(mockConn.close).toHaveBeenCalled();
  expect(result).toBe('mock-result');
});

it('handles json files', async () => {
  const file = new File([JSON.stringify({ x: 1 })], 'data.json', { type: 'application/json' });
  file.text = jest.fn().mockResolvedValue(JSON.stringify({ x: 1 }));

  await insertDuckDBFile(db, file, 'json_table');

  expect(db.registerFileText).toHaveBeenCalled();
  expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining('read_json_auto'));
  expect(db.dropFile).toHaveBeenCalled();
});


it('ignores unsupported extensions', async () => {
  const file = new File(['dummy'], 'notes.txt');
  await insertDuckDBFile(db, file, 'txt_table');

  // No handlers should be called
  expect(db.registerFileText).not.toHaveBeenCalled();
  expect(db.registerFileHandle).not.toHaveBeenCalled();
});
