/**
 * Shared input-name pattern.
 *
 * Mirrors NAME_REGEX in visivo/models/base/named_model.py
 * (`^[a-zA-Z0-9\s'"\-_]+$`): object names may contain letters, digits, spaces,
 * quotes, hyphens and underscores. Every place that scans for or substitutes
 * `${name.accessor}` / `${ref(name).accessor}` must use this pattern so a name
 * the DAG accepts is never silently left as literal text (VIS-1461).
 */
export const INPUT_NAME_CHARS = '[\\w\\s\'"-]+';

/** Accessors are plain identifiers (value, min, max, values, first, last ...). */
export const INPUT_ACCESSOR_CHARS = '\\w+';

/** Build fresh (stateful when global) regexes; never share a /g instance. */
export const inputRefRegex = ({ global = false, anchored = false } = {}) => {
  const core = `\\$\\{(?:ref\\((${INPUT_NAME_CHARS})\\)|(${INPUT_NAME_CHARS}))\\.(${INPUT_ACCESSOR_CHARS})\\}`;
  return new RegExp(anchored ? `^${core}$` : core, global ? 'g' : '');
};

/** Extract [name, accessor] from a regex match built by inputRefRegex. */
export const matchName = m => (m[1] !== undefined ? m[1] : m[2]).trim();

/** True when the name can be used directly as a JS function parameter. */
export const isPlainIdentifier = name => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);

/** Safe JS identifier alias for a name with hyphens, spaces or quotes. */
export const toSafeInputAlias = name => '_input_' + name.replace(/[^a-zA-Z0-9_]/g, '_');
