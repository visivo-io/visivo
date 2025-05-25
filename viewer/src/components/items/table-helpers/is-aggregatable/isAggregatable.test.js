import isAggregatable from "./isAggregatable";

const testValues = [
  "$1,234.56", // Dollar sign and commas
  "€1.234,56", // Euro sign and European number format
  "1,234.56", // Commas
  "1234.56", // Plain number
  " 1234.56 ", // Leading/trailing spaces
  "-", // Dash (should be treated as NULL)
  "", // Empty string (should default to 0)
  null, // Null value (should default to 0)
  "abc", // Non-numeric string (should default to 0)
];

describe("isAggregatable", () => {
  test("returns false for null", () => {
    expect(isAggregatable(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isAggregatable(undefined)).toBe(false);
  });

  test("returns true for number", () => {
    expect(isAggregatable(123)).toBe(true);
  });

  test("returns true for string that can be converted to number", () => {
    expect(isAggregatable("123")).toBe(true);
    expect(isAggregatable("$1,234.56")).toBe(true);
    expect(isAggregatable("1,234.56")).toBe(true);
  });

  test("returns false for string that cannot be converted to number", () => {
    expect(isAggregatable("abc")).toBe(false);
    expect(isAggregatable("")).toBe(false);
    expect(isAggregatable(" ")).toBe(false);
  });

  test("returns false for boolean", () => {
    expect(isAggregatable(true)).toBe(false);
    expect(isAggregatable(false)).toBe(false);
  });
});
