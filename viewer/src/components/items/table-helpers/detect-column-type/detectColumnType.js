const detectColumnType = (data, key) => {
  const sampleSize = Math.min(10, data.length);
  const sample = [];
  for (let i = 0; i < sampleSize; i++) {
    const randomIndex = Math.floor(Math.random() * data.length);
    sample.push(data[randomIndex]);
  }

  let validValueCount = 0;
  const numericCount = sample.reduce((count, row) => {
    const val = row[key];
    if (val === null || val === undefined || val === "") return count;

    validValueCount++; // Count valid values
    const isNumeric =
      typeof val === "number" ||
      (typeof val === "string" && !isNaN(val.replace(/[$,\s]/g, "")));

    return isNumeric ? count + 1 : count;
  }, 0);

  // If no valid values, default to text
  if (validValueCount === 0) return "text";

  // If this happens for a suite of seemingly valid data then there
  // is likely some hidden bad data

  // Use validValueCount instead of sample.length for the ratio
  if (numericCount / validValueCount >= 0.8) return "numeric";
  return "text";
};

export default detectColumnType;