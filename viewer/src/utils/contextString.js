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
