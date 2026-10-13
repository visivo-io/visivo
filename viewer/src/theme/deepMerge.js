const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const deepMerge = (base, override) => {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  if (!isPlainObject(base)) return { ...override };
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || value === null) continue;
    result[key] = isPlainObject(value) ? deepMerge(base[key], value) : value;
  }
  return result;
};
