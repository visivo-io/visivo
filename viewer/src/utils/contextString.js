// Regex patterns
const NAME_REGEX = `[a-zA-Z0-9\\s'"\\-_]`;
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

const METRIC_REF_PATTERN = /['"]?\$\{\s*ref\(([^)]+)\)(?:\.([^}\s]+))?\s*\}['"]?/;

const METRIC_REF_PATTERN_GLOBAL = /['"]?\$\{\s*ref\(([^)]+)\)(?:\.([^}\s]+))?\s*\}['"]?/g;

/**
 * Pattern to match ${ref(name)} or ${ref(name).property} with flexible whitespace
 * Captures: [0] = full match, [1] = name (may have whitespace), [2] = property (optional)
 * Handles variations like:
 *   ${ref(name)}
 *   ${ ref(name) }
 *   ${ref( name )}
 *   ${ ref( name ).property }
 */
export const REF_PATTERN = /\$\{\s*ref\(\s*([^)]+?)\s*\)(?:\s*\.\s*([^}\s]+))?\s*\}/g;

/**
 * Parse text into segments of plain text and refs
 * Returns array of { type: 'text'|'ref', content, name?, property?, start, end }
 * Handles whitespace variations in refs and normalizes the captured name
 */
export const parseTextWithRefs = text => {
  if (!text) return [];

  const segments = [];
  let lastIndex = 0;
  const regex = new RegExp(REF_PATTERN.source, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this ref
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
      });
    }

    // Add the ref - normalize name by trimming whitespace and quotes
    const name = match[1].trim().replace(/^['"]|['"]$/g, '');
    const property = match[2]?.trim() || null;
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

// formatRef and formatRefExpression have moved to src/utils/refString.js
// Re-exported here for backward compatibility with existing imports
export { formatRef, formatRefExpression } from './refString';

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

  getReference() {
    const matches = this.value.match(INLINE_REF_REGEX);
    return matches ? matches[1] : null;
  }

  getRefPropsPath() {
    const matches = this.value.match(INLINE_REF_PROPS_PATH_REGEX);
    return matches ? matches[1] : null;
  }

  getPath() {
    const matches = this.value.match(INLINE_PATH_REGEX);
    return matches ? matches[1] : null;
  }

  getRefAttr() {
    const match = this.value.match(METRIC_REF_PATTERN);
    return match ? match[0] : null;
  }

  getAllRefs() {
    const matches = this.value.match(METRIC_REF_PATTERN_GLOBAL);
    return matches || [];
  }

  static isContextString(obj) {
    if (obj instanceof ContextString) return true;
    if (typeof obj === 'string') {
      return new ContextString(obj).getReference() !== null;
    }
    return false;
  }
}
