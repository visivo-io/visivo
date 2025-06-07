import isAggregatable from "../is-aggregatable/isAggregatable";

/**
 * Detects column type based on sampling data
 * @param {Array} data - The data array to sample from
 * @param {string} key - The column key to analyze
 * @returns {string} "number" if column is numeric, "text" otherwise
 */
const detectColumnType = (data, key) => {
  if (!data || !data.length || !key) return "text";

  // Increase sample size for better detection
  const sampleSize = Math.min(30, data.length);
  
  // Use a different sampling strategy - take from beginning, middle, end
  const sample = [];
  const step = Math.max(1, Math.floor(data.length / sampleSize));
  
  for (let i = 0; i < Math.min(sampleSize, data.length); i++) {
    const index = (i * step) % data.length;
    sample.push(data[index]);
  }

  let validValueCount = 0;
  const numericCount = sample.reduce((count, row) => {
    const val = row[key];
    console.log(`Checking value for key "${key}":`, val);
    
    if (val === null || val === undefined || val === "") return count;

    validValueCount++; // Count valid values
    const result = isAggregatable(val);
    return result ? count + 1 : count;
  }, 0);

  // If no valid values, default to text
  if (validValueCount === 0) return "text";

  // Lower threshold to 60% to be more lenient
  if (numericCount / validValueCount >= 0.6) {
    console.log(`Column ${key} is numeric: ${numericCount}/${validValueCount} values are numbers`);
    return "number";
  }
  
  console.log(`Column ${key} is NOT numeric: only ${numericCount}/${validValueCount} values are numbers`);
  return "text";
};

export default detectColumnType;