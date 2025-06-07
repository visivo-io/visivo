import { useCallback } from 'react';
import generatePivotQuery from '../components/items/table-helpers/generatePivotQuery';

export const usePivotExecution = (db) => {
  const executePivot = useCallback(async ({
    rowFields,
    columnFields,
    valueField,
    aggregateFunc,
    setPivotLoading,
    onPivotComplete
  }) => {
    if (!db || !valueField || rowFields.length === 0) return;
    
    setPivotLoading(true);
    let conn;
    try {
      conn = await db.connect();
    } catch (error) {
      console.error("Error executing pivot query:", error);
      setPivotLoading(false);
      return;
    }

    try {
      // Get database schema
      const schemaQuery = await conn.query(`SELECT * FROM table_data LIMIT 1`);
      const databaseColumns = schemaQuery.schema.fields.map((field) => field.name);

      // Create column name mapping
      const columnNameMapping = databaseColumns.reduce((mapping, columnName) => {
        mapping[columnName] = columnName;
        const sanitizedColumnName = columnName.replace(/\./g, "_");
        if (sanitizedColumnName !== columnName) {
          mapping[sanitizedColumnName] = columnName;
        }
        return mapping;
      }, {});

      const findDbColumn = (field) => {
        const sanitized = field.replace(/\./g, "_");
        return columnNameMapping[sanitized] ?? columnNameMapping[field] ?? field;
      };

      // Sanitize user fields
      const safeRowFields = rowFields.map(findDbColumn);
      const safeColFields = columnFields.map(findDbColumn);
      const safeValField = findDbColumn(valueField);

      // Execute pivot if column fields exist
      if (safeColFields.length > 0) {
        const pivotResult = await generatePivotQuery({
          conn,
          safeRowFields,
          safeColFields,
          safeValField,
          aggregateFunc
        });
        
        onPivotComplete(pivotResult.data, pivotResult.columns);
      } else {
        console.error("No column fields selected.");
      }
    } catch (error) {
      console.error("Error executing pivot query:", error);
    } finally {
      setPivotLoading(false);
      await conn.close();
    }
  }, [db]);

  return { executePivot };
};

// Helper function for pivot query generation
