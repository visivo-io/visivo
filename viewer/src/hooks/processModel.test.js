import { processModel } from './useModelsData';
import { loadInsightParquetFiles, runDuckDBQuery } from '../duckdb/queries';
import { processArrowResult } from '../duckdb/resultProcessing';

// processModel loads a model-job's parquet through the DuckDB layer; mock it so
// we can assert it loads the job's server-signed URL — the same file contract
// insights use — rather than a client-built path (VIS-1132).
jest.mock('../duckdb/queries', () => ({
  loadInsightParquetFiles: jest.fn().mockResolvedValue(undefined),
  runDuckDBQuery: jest.fn().mockResolvedValue({ fake: 'arrow' }),
}));
jest.mock('../duckdb/resultProcessing', () => ({ processArrowResult: jest.fn() }));

const DB_ANY = { fake: 'duckdb' };
const JOB = {
  name: 'orders',
  name_hash: 'mabcdefghijklmnopqrstuvwxyzab',
  signed_data_file_url: 'https://storage.example/signed/orders.parquet?sig=x',
};

describe('processModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    processArrowResult.mockReturnValue([{ id: 1 }]);
  });

  it("loads the job's signed file — not a client-built URL — and returns its rows", async () => {
    const out = await processModel(DB_ANY, JOB);

    // The file it loads is exactly what the server signed; no /api/files/<name>/ guess.
    expect(loadInsightParquetFiles).toHaveBeenCalledWith(
      DB_ANY,
      [{ name_hash: JOB.name_hash, signed_data_file_url: JOB.signed_data_file_url }],
      false
    );
    // The DuckDB table is the job's name_hash.
    expect(runDuckDBQuery).toHaveBeenCalledWith(
      DB_ANY,
      `SELECT * FROM "${JOB.name_hash}"`,
      3,
      1000
    );
    expect(out).toEqual({
      orders: {
        name: 'orders',
        data: [{ id: 1 }],
        files: [{ name_hash: JOB.name_hash, signed_data_file_url: JOB.signed_data_file_url }],
        props_mapping: {},
        error: null,
      },
    });
  });

  it('reports a failure as an error entry rather than throwing', async () => {
    loadInsightParquetFiles.mockRejectedValueOnce(new Error('boom'));

    const out = await processModel(DB_ANY, JOB);

    expect(out.orders.error).toBe('boom');
    expect(out.orders.data).toEqual([]);
  });
});
