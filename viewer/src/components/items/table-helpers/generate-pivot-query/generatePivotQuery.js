import sanitizeColumnName from "../sanitizeColumnName";
import  createSanitizedValueSql from "../create-sanitized-value-sql/createSanitizedValueSql";

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

export default generatePivotQuery;