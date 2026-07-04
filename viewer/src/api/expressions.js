import { getUrl, isAvailable } from '../contexts/URLContext';
import { apiFetch } from './utils';

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

  const response = await apiFetch(getUrl('expressionsTranslate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expressions, source_dialect: sourceDialect }),
  });

  if (response.status === 200) {
    return await response.json();
  }

  throw new Error('Failed to translate expressions');
};

/**
 * Validate that SQL expressions parse under the source dialect (VIS-993).
 *
 * Fail-open contract: when the endpoint isn't available (dist mode, cloud),
 * every expression reports valid — the gate must never block on a check it
 * cannot run; the backend and the run remain the net.
 *
 * @param {Array<{name: string, expression: string}>} expressions
 * @param {string} [sourceDialect]
 * @returns {Promise<{results: Array<{name: string, valid: boolean, error?: string}>}>}
 */
export const validateExpressions = async (expressions, sourceDialect) => {
  if (!isAvailable('expressionsValidate')) {
    return { results: expressions.map(e => ({ name: e.name, valid: true })) };
  }

  const response = await apiFetch(getUrl('expressionsValidate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expressions, source_dialect: sourceDialect }),
  });

  if (response.status === 200) {
    return await response.json();
  }

  throw new Error('Failed to validate expressions');
};
