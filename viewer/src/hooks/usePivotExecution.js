import { useCallback } from 'react';
import createSanitizedValueSql from '../components/items/table-helpers/create-sanitized-value-sql/createSanitizedValueSql';
import sanitizeColumnName from '../components/items/table-helpers/sanitizeColumnName';

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
    const conn = await db.connect();

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
        console.log("No column fields selected.");
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
const generatePivotQuery = async ({
  conn,
  safeRowFields,
  safeColFields,
  safeValField,
  aggregateFunc
}) => {
  // Get distinct combinations
  const cols = safeColFields.map((c) => `"${c}"`).join(", ");
  const q = await conn.query(`SELECT DISTINCT ${cols} FROM table_data`);
  const combos = await q.toArray();
  const plainCombos = combos.map((row) => ({ ...row }));

  // Group labels and conditions
  const groupedLabels = {};
  plainCombos.forEach((combo) => {
    let label = safeColFields
      .map((f) => `${sanitizeColumnName(f)}_${sanitizeColumnName(combo[f] ?? "NULL")}`)
      .join("_");
    
    label = label.replace(/^_+|_+$/g, "");

    const conditions = safeColFields
      .map((f) => {
        const value = combo[f];
        if (value === null) return `"${f}" IS NULL`;
        if (typeof value === "number") return `"${f}" = ${value}`;
        return `"${f}" = '${String(value).replace(/'/g, "''")}'`;
      })
      .join(" AND ");

    if (!groupedLabels[label]) {
      groupedLabels[label] = [];
    }
    groupedLabels[label].push(conditions);
  });

  // Generate CASE expressions
  const caseExpressions = Object.entries(groupedLabels).map(([label, conditions]) => {
    const combinedConditions = conditions.map((cond) => `(${cond})`).join(" OR ");
    const sanitizedValueField = createSanitizedValueSql(safeValField);

    if (aggregateFunc === "COUNT") {
      return `COUNT(CASE WHEN ${combinedConditions} THEN 1 END) AS "${label}"`;
    }
    return `ROUND(${aggregateFunc}(CASE WHEN ${combinedConditions} THEN ${sanitizedValueField} END), 2) AS "${label}"`;
  });

  // Generate and execute SQL
  const groupBy = safeRowFields.map((f) => `"${f}"`).join(", ");
  const sql = `
    SELECT ${groupBy}, ${caseExpressions.join(",\n       ")}
    FROM table_data
    GROUP BY ${groupBy}
    ORDER BY ${groupBy}
  `;

  const result = await conn.query(sql);
  const pivotedData = await result.toArray();

  // Convert data
  const convertedData = pivotedData.map((row) => {
    const newRow = {};
    Object.entries(row).forEach(([key, value]) => {
      if (typeof value === "bigint") {
        newRow[key] = Number(value);
      } else if (typeof value === "string" && !isNaN(value)) {
        newRow[key] = Number(value);
      } else {
        newRow[key] = value;
      }
    });
    return newRow;
  });

  const pivotedColumns = result.schema.fields.map((field) => ({
    id: sanitizeColumnName(field.name),
    header: field.name,
    accessorKey: sanitizeColumnName(field.name),
  }));

  return { data: convertedData, columns: pivotedColumns };
};