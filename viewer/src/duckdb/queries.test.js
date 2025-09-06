import * as queries from "./queries";
import { insertDuckDBFile, runDuckDBQuery, tableDuckDBExists } from "./queries";

jest.mock("@duckdb/duckdb-wasm", () => {
  return {
    DuckDBDataProtocol: {
      BROWSER_FILEREADER: "BROWSER_FILEREADER",
    },
    AsyncDuckDB: jest.fn(),
  };
});



// Fake connection object
const mockConn = {
  query: jest.fn().mockResolvedValue("mock-result"),
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
    jest.spyOn(queries, "runDuckDBQuery");
});

it("executes query and closes connection", async () => {
    const result = await runDuckDBQuery(db, "SELECT 1");

    expect(db.connect).toHaveBeenCalled();
    expect(mockConn.query).toHaveBeenCalledWith("SELECT 1");
    expect(mockConn.close).toHaveBeenCalled();
    expect(result).toBe("mock-result");
});

it("handles parquet files", async () => {
    const file = new File(["dummy"], "test.parquet");
    await insertDuckDBFile(db, file, "parquet_table");

    expect(db.registerFileHandle).toHaveBeenCalled();
    expect(db.dropFile).toHaveBeenCalled();
});

it("handles csv files", async () => {
    const file = new File(["a,b\n1,2"], "data.csv", { type: "text/csv" });
    file.text = jest.fn().mockResolvedValue("a,b\n1,2");

    await insertDuckDBFile(db, file, "csv_table");

    expect(db.registerFileText).toHaveBeenCalled();
    expect(mockConn.insertCSVFromPath).toHaveBeenCalledWith(expect.any(String), {
        name: "csv_table",
        schema: "main",
        detect: true,
    });
    expect(db.dropFile).toHaveBeenCalled();
});

it("handles json files", async () => {
    const file = new File([JSON.stringify({ x: 1 })], "data.json", { type: "application/json" });
    file.text = jest.fn().mockResolvedValue(JSON.stringify({ x: 1 }));

    await insertDuckDBFile(db, file, "json_table");

    expect(db.registerFileText).toHaveBeenCalled();
    expect(mockConn.query).toHaveBeenCalledWith(expect.stringContaining("read_json_auto"));
    expect(db.dropFile).toHaveBeenCalled();
});

it("calls inferTypes for CSV files with year column", async () => {
    // Fake runDuckDBQuery returning a column with "year"
    mockConn.query.mockResolvedValueOnce({
        numRows: 1,
        get: () => ({ toArray: () => ["fiscal_year", "INTEGER"] }),
    });

    const file = new File(["year\n2020"], "with_year.csv");
    file.text = jest.fn().mockResolvedValue("year\n2020");

    await insertDuckDBFile(db, file, "with_year_table");

    expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining("information_schema.columns"),
    );
    expect(mockConn.query).toHaveBeenCalledWith(
        expect.stringContaining("ALTER TABLE"),
    );
});

it("ignores unsupported extensions", async () => {
    const file = new File(["dummy"], "notes.txt");
    await insertDuckDBFile(db, file, "txt_table");

    // No handlers should be called
    expect(db.registerFileText).not.toHaveBeenCalled();
    expect(db.registerFileHandle).not.toHaveBeenCalled();
});