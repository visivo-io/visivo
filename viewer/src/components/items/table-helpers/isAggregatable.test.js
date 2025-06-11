import isAggregatable from "./isAggregatable";

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
