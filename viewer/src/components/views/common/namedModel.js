/**
 * Name validation for project objects.
 *
 * There are two grammars, not one. Most objects accept hyphens; a metric or
 * dimension does not, because its name becomes a SQL identifier — a metric's
 * name IS its alias in the generated query. A single shared pattern was wrong
 * for those two types in both directions: `2024_revenue` passed here and was
 * rejected on save, and `_total` was refused here despite being legal.
 *
 * The rule is published in the JSON schema (`properties.name.pattern`, from
 * `SQL_IDENTIFIER_NAME_PATTERN` in `named_model.py`), so `nameGrammarFor` reads
 * it from there and falls back to these constants only when the schema hasn't
 * loaded.
 */

import { getObjectSchemaSync } from '../../../schemas/projectSchema';

/** Letters, numbers, underscores and hyphens; must start alphanumeric. */
export const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/** A SQL identifier: no hyphens, no leading digit. Mirrors the backend. */
export const NAME_SQL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const GENERAL_MESSAGE =
  'Name must start with a letter or number and contain only letters, numbers, underscores, and hyphens';
const SQL_MESSAGE =
  'Name must start with a letter or underscore and contain only letters, numbers, and underscores — it becomes a SQL identifier';

/** Types whose name is a SQL identifier, used when the schema is unavailable. */
const SQL_NAMED_TYPES = new Set(['metric', 'dimension']);

/**
 * The pattern and message for `type`, preferring the published schema.
 *
 * @param {string} [type] - object type, e.g. 'metric'. Omitted means the
 *   general grammar, which is what every non-schema-aware caller wants.
 * @returns {{pattern: RegExp, message: string}}
 */
export function nameGrammarFor(type) {
  const published = type ? getObjectSchemaSync(type)?.properties?.name?.pattern : null;
  if (published) {
    return {
      pattern: new RegExp(published),
      message: published === NAME_SQL_PATTERN.source ? SQL_MESSAGE : GENERAL_MESSAGE,
    };
  }
  return SQL_NAMED_TYPES.has(type)
    ? { pattern: NAME_SQL_PATTERN, message: SQL_MESSAGE }
    : { pattern: NAME_PATTERN, message: GENERAL_MESSAGE };
}

/**
 * @param {string} name
 * @param {string} [type] - validates against that type's grammar
 * @returns {string|null} error message, or null when valid
 */
export function validateName(name, type) {
  if (!name.trim()) {
    return 'Name is required';
  }
  const { pattern, message } = nameGrammarFor(type);
  if (!pattern.test(name)) {
    return message;
  }
  return null;
}
