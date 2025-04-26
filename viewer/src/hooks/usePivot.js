import { useState, useCallback } from "react";

const usePivot = (db, tableData, columns) => {
  const [pivotedData, setPivotedData] = useState(null);
  const [pivotedColumns, setPivotedColumns] = useState([]);
  const [isPivoted, setIsPivoted] = useState(false);
  const [pivotLoading, setPivotLoading] = useState(false);

  // Helper function to sanitize column names for SQL
  const sanitizeColumnName = useCallback((name) => {
    if (!name) return "unknown";
    return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/\s+/g, "_");
  }, []);

  const executePivot = useCallback(
    async (rowFields, columnFields, valueField, aggregateFunc) => {
      if (!db || !valueField || rowFields.length === 0) {
        console.warn("Cannot execute pivot: missing required parameters");
        return;
      }

      setPivotLoading(true);
      let conn;

      try {
        conn = await db.connect();
        try {
          const tableCheck = await conn.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='table_data'"
          );
          const exists = (await tableCheck.toArray()).length > 0;
          if (!exists) {
            throw new Error(
              "Table 'table_data' does not exist. Please load data first."
            );
          }
        } catch (tableError) {
          console.error("Error checking table existence:", tableError);
          throw tableError;
        }

        // Fetch schema and create column map
        const schemaQ = await conn.query(`SELECT * FROM table_data LIMIT 1`);
        const dbCols = schemaQ.schema.fields.map((f) => f.name);

        // Build column mapping for different notation styles
        const dbColumnMap = dbCols.reduce((map, col) => {
          map[col] = col;
          map[col.replace(/_/g, ".")] = col; // Map dotted to underscores
          map[col.replace(/\./g, "_")] = col; // Map underscores to dotted
          return map;
        }, {});

        // Find DB column based on user input
        const localFindDbCol = (field) => {
          const sanitized = field.replace(/\./g, "_");
          return dbColumnMap[sanitized] ?? dbColumnMap[field] ?? field;
        };

        // Sanitize user fields
        const safeRowFields = rowFields.filter(Boolean).map(localFindDbCol);
        const safeColFields = columnFields.filter(Boolean).map(localFindDbCol);
        const safeValField = localFindDbCol(valueField);

        console.log("Safe row fields:", safeRowFields);
        console.log("Safe column fields:", safeColFields);
        console.log("Safe value field:", safeValField);

        if (safeRowFields.length === 0) {
          throw new Error("No valid row fields selected");
        }

        // Process column fields if present
        if (safeColFields.length > 0) {
          // Get distinct column combinations
          const cols = safeColFields.map((c) => `"${c}"`).join(", ");
          const q = await conn.query(`SELECT DISTINCT ${cols} FROM table_data`);
          const combos = await q.toArray();
          const plainCombos = combos.map((row) => ({ ...row })); // Convert Proxy objects

          // Normalize and deduplicate combinations
          const normalizedCombos = Array.from(
            new Map(
              plainCombos.map((combo) => {
                const normalizedCombo = {};
                Object.keys(combo).forEach((key) => {
                  const value = combo[key];
                  normalizedCombo[key] =
                    typeof value === "string" ? value.trim() : value;
                });
                return [JSON.stringify(normalizedCombo), normalizedCombo];
              })
            ).values()
          );

          // Group labels and conditions
          const groupedLabels = {};
          normalizedCombos.forEach((combo) => {
            // Create label from column fields and values
            let label = safeColFields
              .map(
                (f) =>
                  `${sanitizeColumnName(f)}_${sanitizeColumnName(
                    combo[f] ?? "NULL"
                  )}`
              )
              .join("_")
              .replace(/^_+|_+$/g, "");

            // Generate SQL conditions
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
          const caseExpressions = Object.entries(groupedLabels).map(
            ([label, conditions]) => {
              const combinedConditions = conditions
                .map((cond) => `(${cond})`)
                .join(" OR ");

              // SQL to sanitize and cast numeric values
              const sanitizedValueField = `
                COALESCE(
                  TRY_CAST(
                    CASE 
                      WHEN REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE("${safeValField}", '$', ''), 
                            '€', ''
                          ),
                          ',', ''
                        ),
                        ' ', ''
                      ) = '-' THEN NULL
                      ELSE REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE("${safeValField}", '$', ''), 
                            '€', ''
                          ),
                          ',', ''
                        ),
                        ' ', ''
                      )
                    END AS DOUBLE
                  ), 0
                )
              `;

              if (aggregateFunc === "COUNT") {
                return `COUNT(CASE WHEN ${combinedConditions} THEN 1 END) AS "${label}"`;
              }

              return `${aggregateFunc}(CASE WHEN ${combinedConditions} THEN ${sanitizedValueField} END) AS "${label}"`;
            }
          );

          // Generate and execute pivot query
          const groupBy = safeRowFields.map((f) => `"${f}"`).join(", ");
          const sql = `
            SELECT ${groupBy}, ${caseExpressions.join(",\n       ")}
            FROM table_data
            GROUP BY ${groupBy}
            ORDER BY ${groupBy}
          `;

          console.log("Executing pivot query:", sql);
          const result = await conn.query(sql);
          const data = await result.toArray();

          // Map result columns to format expected by the table
          const resultColumns = result.schema.fields.map((field) => ({
            id: sanitizeColumnName(field.name),
            header: field.name,
            accessorKey: sanitizeColumnName(field.name),
          }));

          setPivotedData(data);
          setPivotedColumns(resultColumns);
          setIsPivoted(true);
        } else {
          console.warn("No column fields selected for pivot");
        }
      } catch (error) {
        console.error("Error executing pivot:", error);
        // Optionally, set state to show error in UI
      } finally {
        if (conn) await conn.close();
        setPivotLoading(false);
      }
    },
    [db, sanitizeColumnName]
  );

  const resetPivot = useCallback(() => {
    setPivotedData(null);
    setPivotedColumns([]);
    setIsPivoted(false);
  }, []);

  return {
    pivotedData,
    pivotedColumns,
    isPivoted,
    pivotLoading,
    executePivot,
    resetPivot,
    setIsPivoted,
  };
};

export default usePivot;
