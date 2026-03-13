/**
 * SQL keywords for autocomplete suggestions
 */
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'ILIKE',
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'AS',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'OUTER JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'ON',
  'USING',
  'DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COALESCE',
  'NULLIF',
  'CAST',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'NULL',
  'IS',
  'IS NOT',
  'BETWEEN',
  'EXISTS',
  'UNION',
  'UNION ALL',
  'INTERSECT',
  'EXCEPT',
  'WITH',
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'DROP',
  'ALTER',
  'TABLE',
  'INDEX',
  'VIEW',
  'ASC',
  'DESC',
  'NULLS FIRST',
  'NULLS LAST',
  'TRUE',
  'FALSE',
];

/**
 * Create Monaco autocomplete suggestions from schema data.
 *
 * @param {Object} schemaData - Schema data from useSourceSchema hook
 * @param {Array} schemaData.tables - Array of table objects
 * @param {Object} schemaData.tableColumns - Map of table name to columns array
 * @param {Object} monaco - Monaco instance
 * @returns {Object} Monaco completion provider
 */
export const createSQLCompletionProvider = (schemaData, monaco) => {
  return {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [];

      // SQL keywords
      SQL_KEYWORDS.forEach(keyword => {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
          sortText: `2_${keyword}`,
        });
      });

      // Tables from schema
      if (schemaData?.tables) {
        for (const table of schemaData.tables) {
          const tableName = table.table_name || table.name;
          if (!tableName) continue;

          const schemaName = table.schema_name || table.schema;
          const fullName = schemaName ? `${schemaName}.${tableName}` : tableName;

          suggestions.push({
            label: tableName,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: fullName,
            detail: schemaName ? `Schema: ${schemaName}` : 'Table',
            documentation: table.description || undefined,
            range,
            sortText: `0_${tableName}`,
          });
        }
      }

      // Columns from schema
      if (schemaData?.tableColumns) {
        for (const [tableName, columns] of Object.entries(schemaData.tableColumns)) {
          if (!Array.isArray(columns)) continue;

          for (const column of columns) {
            const colName = column.column_name || column.name;
            if (!colName) continue;

            const colType = column.data_type || column.type || '';

            suggestions.push({
              label: colName,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: colName,
              detail: colType ? `${colType} (${tableName})` : tableName,
              documentation: column.description || undefined,
              range,
              sortText: `1_${colName}`,
            });
          }
        }
      }

      return { suggestions };
    },
  };
};

/**
 * Dispose of a Monaco completion provider registration.
 *
 * @param {Object} disposable - The disposable returned by monaco.languages.registerCompletionItemProvider
 */
export const disposeCompletionProvider = disposable => {
  if (disposable && typeof disposable.dispose === 'function') {
    disposable.dispose();
  }
};

export default createSQLCompletionProvider;
