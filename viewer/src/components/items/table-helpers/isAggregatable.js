const isAggregatable = (value) => {
  // Handle nulls and undefined
  if (value === null || value === undefined) return false;

  if (typeof value === "number") return true;

  if (typeof value === "string") {
    if (value.trim() === "") return false;

    const cleanValue = value.replace(/[$,\s]/g, "");
    const parsedValue = Number(cleanValue);
    
    return !isNaN(parsedValue);
  }

  return false;
};

export default isAggregatable;