import { formatValueForSql } from "./formatValueForSql";
/**
 * Performs a batch insert of rows into db
 * @param {Object} conn - DuckDB connection
 * @param {Array} data - Array of data objects to insert
 * @param {Object} columnTypes - Mapping of column names to types
 * @param {number} batchSize - Number of rows per batch
 * @returns {Object} - Result statistics
 */
export const batchInsertData = async (conn, data, columnTypes, batchSize = 500) => {
  let insertedRows = 0;
  let errorRows = 0;

  const totalBatches = Math.ceil(data.length / batchSize);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * batchSize;
    const batchEnd = Math.min((batchIndex + 1) * batchSize, data.length);
    const batch = data.slice(batchStart, batchEnd);

    if (batch.length === 0) continue;

    try {
      // Get column names once for the batch
      const columns = Object.keys(batch[0]);
      const columnsStr = columns.join('", "');

      // Build multi-row VALUES syntax
      const valuesClause = batch.map(row => {
        const rowValues = columns.map(key =>
          formatValueForSql(row[key], columnTypes[key])
        ).join(", ");

        return `(${rowValues})`;
      }).join(",\n");

      // Execute a single INSERT statement for the entire batch
      await conn.query(`INSERT INTO table_data ("${columnsStr}") VALUES ${valuesClause}`);
      insertedRows += batch.length;
    } catch (error) {
      errorRows += batch.length;
    }
  }

  return { insertedRows, errorRows };
};
