import { getUrl, isAvailable } from '../contexts/URLContext';

/**
 * Translate SQL expressions from a source dialect to DuckDB dialect.
 *
 * @param {Array<{name: string, expression: string, type: string}>} expressions
 * @param {string} sourceDialect - e.g. 'postgresql', 'snowflake', 'mysql'
 * @returns {Promise<{translations: Array, errors: Array}>}
 */
export const translateExpressions = async (expressions, sourceDialect) => {
  if (!isAvailable('expressionsTranslate')) {
    // Fallback: return expressions as-is when endpoint not available (dist mode)
    return {
      translations: expressions.map((e) => ({
        ...e,
        duckdb_expression: e.expression,
      })),
      errors: [],
    };
  }

  const response = await fetch(getUrl('expressionsTranslate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expressions, source_dialect: sourceDialect }),
  });

  if (response.status === 200) {
    return await response.json();
  }

  throw new Error('Failed to translate expressions');
};
