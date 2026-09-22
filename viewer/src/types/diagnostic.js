/**
 * The Diagnostic contract — viewer-side mirror of `visivo/models/diagnostic.py`.
 *
 * One shape for every failure the server can describe, from a parse error to a
 * skipped job. Wire payloads are ADDITIVE: `error_json` keeps `phase` and grows
 * `diagnostics`; consumers keep their existing fallbacks for payloads that
 * predate the contract. Keep this file in sync with the Python model — the
 * shape is the contract.
 *
 * @typedef {Object} DiagnosticObjectRef
 * @property {string} type   Object type, e.g. 'model', 'insight', 'source'.
 * @property {string} name   The object's name.
 *
 * @typedef {Object} DiagnosticLocation
 * @property {string} file          Path to the file, as the project references it.
 * @property {?number} [line]       1-indexed line number when known.
 *
 * @typedef {Object} DiagnosticRelated
 * @property {string} message
 * @property {?DiagnosticObjectRef} [object]
 * @property {?DiagnosticLocation} [location]
 *
 * @typedef {Object} Diagnostic
 * @property {'error'|'warning'|'info'|'hint'} severity
 * @property {'parse'|'compile'|'run'|'serve'|'save'|'commit'|'deploy'} phase
 * @property {string} code           A key from DIAGNOSTIC_CODES (append-only vocabulary).
 * @property {string} message        One human-readable sentence. Never a traceback.
 * @property {?DiagnosticObjectRef} [object]   The object this is about, when resolvable.
 * @property {?string} [field]       Dotted path to the failing field in the object's config.
 * @property {?string} [detail]      Longer context — never shown as the headline.
 * @property {?DiagnosticLocation} [location]
 * @property {?string} [hint]        What the user can do about it.
 * @property {DiagnosticRelated[]} [related]
 */

export const DIAGNOSTIC_SEVERITIES = ['error', 'warning', 'info', 'hint'];

export const DIAGNOSTIC_PHASES = ['parse', 'compile', 'run', 'serve', 'save', 'commit', 'deploy'];

// The append-only code vocabulary — mirror of DIAGNOSTIC_CODES in
// visivo/models/diagnostic.py. Viewer branches (join-fix cards, not-built
// empty states) key off these strings.
export const DIAGNOSTIC_CODES = [
  'extra_forbidden',
  'missing_field',
  'invalid_value',
  'broken_reference',
  'expression_parse_failed',
  'yaml_parse_failed',
  'source_locked',
  'source_connection_failed',
  'dependency_failed',
  'missing_relation',
  'ambiguous_relation',
  'cross_source',
  'query_execution_failed',
  'schema_build_failed',
  'not_built',
  'commit_validation_failed',
  'unexpected_error',
];

/**
 * Read the diagnostics off any wire payload that may or may not carry them.
 * Tolerates a payload that arrives as a JSON-encoded string — `error_json`
 * is documented to show up that way in some older run rows.
 * @param {?Object|string} payload  e.g. a run's `error_json` or an `error.json` body.
 * @returns {Diagnostic[]}
 */
export const diagnosticsFrom = payload => {
  let parsed = payload;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!parsed || !Array.isArray(parsed.diagnostics)) return [];
  return parsed.diagnostics.filter(d => d && typeof d.message === 'string');
};
