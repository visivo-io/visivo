// Regex patterns
const NAME_REGEX = `[a-zA-Z0-9\\s'"\\-_]`;

// New refs syntax: ${refs.name} or ${refs.name.property}
const REFS_NAME_PATTERN = '[a-zA-Z_][a-zA-Z0-9_-]*';
const REFS_PROPERTY_PATH_PATTERN = '(?:(?:\\.[a-zA-Z_][a-zA-Z0-9_-]*|\\[\\d+\\])+)?';

// Pattern for new refs syntax
const INLINE_REFS_REGEX = new RegExp(
  `\\$\\{\\s*refs\\.(${REFS_NAME_PATTERN})${REFS_PROPERTY_PATH_PATTERN}\\s*\\}`
);
const INLINE_REFS_PROPS_PATH_REGEX = new RegExp(
  `\\$\\{\\s*refs\\.${REFS_NAME_PATTERN}(${REFS_PROPERTY_PATH_PATTERN})\\s*\\}`
);

// Legacy ref() syntax: ${ref(name)} or ${ref(name).property}
const INLINE_REF_REGEX = new RegExp(
  `\\$\\{\\s*ref\\((${NAME_REGEX}+?)\\)[\\.\\d\\w\\[\\]]*\\s*\\}`
);
const INLINE_REF_PROPS_PATH_REGEX = new RegExp(
  `\\$\\{\\s*ref\\(${NAME_REGEX}+?\\)([\\.\\d\\w\\[\\]]*)\\s*\\}`
);
const INLINE_PATH_REGEX = new RegExp(`\\$\\{\\s*(${NAME_REGEX}[\\.\\[\\]]+?)\\s*\\}`);
const CONTEXT_STRING_VALUE_REGEX = new RegExp(
  `\\$\\{\\s*(${NAME_REGEX}[\\.\\[\\]\\)\\(]+?)\\s*\\}`
);

// Legacy ref patterns (for matching)
const METRIC_REF_PATTERN = /['"]?\$\{\s*ref\(([^)]+)\)(?:\.([^}\s]+))?\s*\}['"]?/;
const METRIC_REF_PATTERN_GLOBAL = /['"]?\$\{\s*ref\(([^)]+)\)(?:\.([^}\s]+))?\s*\}['"]?/g;

// New refs patterns (for matching)
const METRIC_REFS_PATTERN = new RegExp(
  `['"]?\\$\\{\\s*refs\\.(${REFS_NAME_PATTERN})(?:\\.(${REFS_NAME_PATTERN}(?:\\.${REFS_NAME_PATTERN}|\\[\\d+\\])*))?\\s*\\}['"]?`
);
const METRIC_REFS_PATTERN_GLOBAL = new RegExp(
  `['"]?\\$\\{\\s*refs\\.(${REFS_NAME_PATTERN})(?:\\.(${REFS_NAME_PATTERN}(?:\\.${REFS_NAME_PATTERN}|\\[\\d+\\])*))?\\s*\\}['"]?`,
  'g'
);

/**
 * Pattern to match ${ref(name)} or ${ref(name).property} with flexible whitespace (LEGACY)
 * Captures: [0] = full match, [1] = name (may have whitespace), [2] = property (optional)
 * Handles variations like:
 *   ${ref(name)}
 *   ${ ref(name) }
 *   ${ref( name )}
 *   ${ ref( name ).property }
 */
export const REF_PATTERN = /\$\{\s*ref\(\s*([^)]+?)\s*\)(?:\s*\.\s*([^}\s]+))?\s*\}/g;

/**
 * Pattern to match ${refs.name} or ${refs.name.property} with flexible whitespace (NEW)
 * Captures: [0] = full match, [1] = name, [2] = property path (optional)
 * Examples:
 *   ${refs.orders}
 *   ${refs.orders.id}
 *   ${refs.my-model.data}
 */
export const REFS_PATTERN = new RegExp(
  `\\$\\{\\s*refs\\.(${REFS_NAME_PATTERN})(?:\\.(${REFS_NAME_PATTERN}(?:\\.${REFS_NAME_PATTERN}|\\[\\d+\\])*))?\\s*\\}`,
  'g'
);

/**
 * Parse text into segments of plain text and refs
 * Returns array of { type: 'text'|'ref', content, name?, property?, start, end }
 * Handles both new ${refs.name} and legacy ${ref(name)} syntax
 */
export const parseTextWithRefs = text => {
  if (!text) return [];

  const segments = [];
  let lastIndex = 0;

  // Combined pattern to match both syntaxes
  // Group structure: refs syntax captures in groups 1-2, legacy ref() in groups 3-4
  const combinedPattern = new RegExp(
    `\\$\\{\\s*refs\\.(${REFS_NAME_PATTERN})(?:\\.(${REFS_NAME_PATTERN}(?:\\.${REFS_NAME_PATTERN}|\\[\\d+\\])*))?\\s*\\}|\\$\\{\\s*ref\\(\\s*([^)]+?)\\s*\\)(?:\\s*\\.\\s*([^}\\s]+))?\\s*\\}`,
    'g'
  );

  let match;
  while ((match = combinedPattern.exec(text)) !== null) {
    // Add text before this ref
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
      });
    }

    // Determine which syntax was matched
    let name, property;
    if (match[1] !== undefined) {
      // New refs syntax: ${refs.name.property}
      name = match[1];
      property = match[2] || null;
    } else {
      // Legacy ref() syntax: ${ref(name).property}
      name = match[3].trim().replace(/^['"]|['"]$/g, '');
      property = match[4]?.trim() || null;
    }

    segments.push({
      type: 'ref',
      content: match[0],
      name,
      property,
      start: match.index,
      end: match.index + match[0].length,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
      start: lastIndex,
      end: text.length,
    });
  }

  return segments;
};

/**
 * Check if a position in text is inside a ${} block
 * Used to determine whether to wrap new refs with ${}
 */
export const isInsideDollarBrace = (text, position) => {
  if (!text || position < 0) return false;

  // Find the last ${ before position and track brace depth
  let depth = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '{') {
      depth++;
      i++; // Skip the {
    } else if (text[i] === '}' && depth > 0) {
      depth--;
    }
  }

  return depth > 0;
};

/**
 * Format a ref string in the canonical form (no extra whitespace)
 * Always outputs: refs.name or refs.name.property (NEW SYNTAX)
 */
export const formatRef = (name, property = null) => {
  const cleanName = name.trim();
  return property ? `refs.${cleanName}.${property.trim()}` : `refs.${cleanName}`;
};

/**
 * Format a complete ref expression with ${} wrapper using NEW syntax
 * Always outputs: ${refs.name} or ${refs.name.property}
 */
export const formatRefExpression = (name, property = null) => {
  return `\${${formatRef(name, property)}}`;
};

/**
 * Format a ref expression using NEW refs syntax
 * Alias for formatRefExpression for clarity
 * Always outputs: ${refs.name} or ${refs.name.property}
 */
export const formatRefsExpression = (name, property = null) => {
  const cleanName = name.trim();
  if (property) {
    return `\${refs.${cleanName}.${property.trim()}}`;
  }
  return `\${refs.${cleanName}}`;
};

/**
 * Format a ref expression using LEGACY ref() syntax (for backwards compatibility)
 * Always outputs: ${ref(name)} or ${ref(name).property}
 * @deprecated Use formatRefExpression or formatRefsExpression instead
 */
export const formatLegacyRefExpression = (name, property = null) => {
  const cleanName = name.trim();
  if (property) {
    return `\${ref(${cleanName}).${property.trim()}}`;
  }
  return `\${ref(${cleanName})}`;
};

/**
 * Format an environment variable reference
 * Always outputs: ${env.VAR_NAME}
 */
export const formatEnvVar = varName => {
  return `\${env.${varName.trim()}}`;
};

/**
 * Pattern to match ${env.VAR_NAME} with flexible whitespace
 */
export const ENV_VAR_PATTERN = /\$\{\s*env\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}/g;

/**
 * Check if a string contains env var references
 */
export const hasEnvVarRef = text => {
  if (!text) return false;
  return new RegExp(ENV_VAR_PATTERN.source).test(text);
};

/**
 * Extract env var names from text
 */
export const extractEnvVarNames = text => {
  if (!text) return [];
  const regex = new RegExp(ENV_VAR_PATTERN.source, 'g');
  const names = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    names.push(match[1]);
  }
  return names;
};

export class ContextString {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }

  equals(other) {
    if (other instanceof ContextString) {
      return (
        (this.value.match(CONTEXT_STRING_VALUE_REGEX) || []).join('') ===
        (other.value.match(CONTEXT_STRING_VALUE_REGEX) || []).join('')
      );
    }
    return false;
  }

  hashCode() {
    return (this.value.match(CONTEXT_STRING_VALUE_REGEX) || []).join('').hashCode ?? 0;
  }

  /**
   * Check if this context string uses the new ${refs.name} syntax.
   */
  usesRefsSyntax() {
    return INLINE_REFS_REGEX.test(this.value);
  }

  /**
   * Check if this context string uses the legacy ${ref(name)} syntax.
   */
  usesRefSyntax() {
    return INLINE_REF_REGEX.test(this.value);
  }

  /**
   * Get the referenced object name.
   * Works with both new ${refs.name} and legacy ${ref(name)} syntax.
   */
  getReference() {
    // Try new refs syntax first
    const refsMatches = this.value.match(INLINE_REFS_REGEX);
    if (refsMatches) {
      return refsMatches[1];
    }

    // Fall back to legacy ref() syntax
    const refMatches = this.value.match(INLINE_REF_REGEX);
    return refMatches ? refMatches[1] : null;
  }

  /**
   * Get the property path after the reference.
   * Works with both new ${refs.name.property} and legacy ${ref(name).property} syntax.
   */
  getRefPropsPath() {
    // Try new refs syntax first
    const refsMatches = this.value.match(INLINE_REFS_PROPS_PATH_REGEX);
    if (refsMatches && refsMatches[1]) {
      return refsMatches[1];
    }

    // Fall back to legacy ref() syntax
    const refMatches = this.value.match(INLINE_REF_PROPS_PATH_REGEX);
    return refMatches ? refMatches[1] : null;
  }

  getPath() {
    const matches = this.value.match(INLINE_PATH_REGEX);
    return matches ? matches[1] : null;
  }

  /**
   * Get the full ref attribute if present.
   * Works with both ${refs.name} and ${ref(name)} syntax.
   */
  getRefAttr() {
    // Try new refs syntax first
    const refsMatch = this.value.match(METRIC_REFS_PATTERN);
    if (refsMatch) {
      return refsMatch[0];
    }

    // Fall back to legacy ref() syntax
    const refMatch = this.value.match(METRIC_REF_PATTERN);
    return refMatch ? refMatch[0] : null;
  }

  /**
   * Get all ref patterns in the string.
   * Returns both new ${refs.name} and legacy ${ref(name)} patterns.
   */
  getAllRefs() {
    const refsMatches = this.value.match(METRIC_REFS_PATTERN_GLOBAL) || [];
    const refMatches = this.value.match(METRIC_REF_PATTERN_GLOBAL) || [];
    return [...refsMatches, ...refMatches];
  }

  static isContextString(obj) {
    if (obj instanceof ContextString) return true;
    if (typeof obj === 'string') {
      return new ContextString(obj).getReference() !== null;
    }
    return false;
  }
}
