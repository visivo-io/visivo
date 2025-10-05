export class QueryString {
  static QUERY_STRING_VALUE_REGEX = /^\?\{\s*(?<query_string>.+)\s*\}\s*$/;

  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }

  getValue() {
    const match = this.value.match(QueryString.QUERY_STRING_VALUE_REGEX);
    return match?.groups?.query_string?.trim() ?? null;
  }

  static isQueryString(obj) {
    return obj instanceof QueryString ||
      (typeof obj === "string" && QueryString.QUERY_STRING_VALUE_REGEX.test(obj));
  }
}