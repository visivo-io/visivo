const detectColumnType = (data, key) => {
  const sampleSize = Math.min(10, data.length);
  const sample = [];
  for (let i = 0; i < sampleSize; i++) {
    const randomIndex = Math.floor(Math.random() * data.length);
    sample.push(data[randomIndex]);
  }

  const numericCount = sample.reduce((count, row) => {
    const val = row[key];
    if (val === null || val === undefined || val === "") return count;

    const isNumeric =
      typeof val === "number" ||
      (typeof val === "string" && !isNaN(val.replace(/[$,\s]/g, "")));

    return isNumeric ? count + 1 : count;
  }, 0);

  if (numericCount / sample.length >= 0.8) return "numeric";
  return "text";
};

export default detectColumnType;