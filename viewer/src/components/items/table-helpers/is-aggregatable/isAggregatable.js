const isAggregatable = (value) => {
  // Handle nulls and undefined
  if (value === null || value === undefined) return false;

  // Already a number
  if (typeof value === "number") return true;

  // Check if string can be cast to a number
  if (typeof value === "string") {
    // Empty strings should return false
    if (value.trim() === "") return false;

    // Try to convert to a number with more lenient approach
    const cleanValue = value.replace(/[$,\s]/g, "");
    const parsedValue = Number(cleanValue);
    return !isNaN(parsedValue);
  }

  return false;
};

export default isAggregatable;
