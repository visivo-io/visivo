import * as duckdb from '@duckdb/duckdb-wasm';

/**
 * DuckDB WASM Service for client-side data processing
 * Handles initialization, data loading, and query execution
 */
class DuckDBService {
  constructor() {
    this.db = null;
    this.conn = null;
    this.initialized = false;
  }

  /**
   * Initialize DuckDB WASM instance
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Select bundle based on browser capabilities
      const MANUAL_BUNDLES = {
        mvp: {
          mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
          mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
        },
        eh: {
          mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
          mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
        },
      };

      // Try to select the best bundle
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      
      // Instantiate worker
      const worker = new Worker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();
      
      // Initialize DuckDB
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule);
      
      // Create connection
      this.conn = await this.db.connect();
      
      this.initialized = true;
      console.log('DuckDB WASM initialized successfully');
    } catch (error) {
      console.error('Failed to initialize DuckDB WASM:', error);
      throw new Error('DuckDB initialization failed: ' + error.message);
    }
  }

  /**
   * Load data into a temporary table
   * @param {string} tableName - Name for the temporary table
   * @param {Object} data - Data object with column arrays
   * @returns {Promise<void>}
   */
  async loadData(tableName, data) {
    await this.ensureInitialized();

    try {
      // Convert data object to rows format
      const columns = Object.keys(data);
      const rows = [];
      
      if (columns.length === 0) {
        throw new Error('No data columns provided');
      }

      // Get the length from the first column
      const firstColumn = data[columns[0]];
      const rowCount = Array.isArray(firstColumn) ? firstColumn.length : 1;

      // Convert column-based data to row-based data
      for (let i = 0; i < rowCount; i++) {
        const row = {};
        columns.forEach(col => {
          const columnData = data[col];
          row[col] = Array.isArray(columnData) ? columnData[i] : columnData;
        });
        rows.push(row);
      }

      // Create table and insert data
      await this.conn.insertJSONFromPath(tableName, {
        data: rows,
        schema: 'main'
      });

      console.log(`Loaded ${rows.length} rows into table '${tableName}'`);
    } catch (error) {
      console.error(`Failed to load data into table '${tableName}':`, error);
      throw new Error(`Data loading failed: ${error.message}`);
    }
  }

  /**
   * Execute a SQL query
   * @param {string} sql - SQL query to execute
   * @returns {Promise<Array>} Query results as array of objects
   */
  async executeQuery(sql) {
    await this.ensureInitialized();

    try {
      const result = await this.conn.query(sql);
      return result.toArray().map(row => Object.fromEntries(row));
    } catch (error) {
      console.error('Query execution failed:', error);
      throw new Error(`Query failed: ${error.message}`);
    }
  }


  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      if (this.conn) {
        await this.conn.close();
        this.conn = null;
      }
      if (this.db) {
        await this.db.terminate();
        this.db = null;
      }
      this.initialized = false;
      console.log('DuckDB WASM cleaned up successfully');
    } catch (error) {
      console.error('Failed to cleanup DuckDB WASM:', error);
    }
  }

  /**
   * Ensure DuckDB is initialized
   * @private
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance
export const duckdbService = new DuckDBService();

// Export class for testing
export { DuckDBService };