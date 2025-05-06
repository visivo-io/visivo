const sanitizeColumnName = (name) => {
  if (name === null || name === undefined) {
    return "null";
  }

  const strName = typeof name !== "string" ? String(name) : name;

  return strName.replace(/[^a-zA-Z0-9_]/g, "_").replace(/\s+/g, "_");
};

export default sanitizeColumnName;
