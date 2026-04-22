/**
 * Generate a unique name by appending _N suffix if the base name is taken.
 * @param {string} prefix - Desired name
 * @param {Set|Array|Object} existingNames - Names already in use (Set, Array, or Object keys)
 * @returns {string} Guaranteed unique name
 */
export function generateUniqueName(prefix, existingNames) {
  const nameSet =
    existingNames instanceof Set
      ? existingNames
      : Array.isArray(existingNames)
        ? new Set(existingNames)
        : new Set(Object.keys(existingNames || {}));

  if (!nameSet.has(prefix)) return prefix;

  let counter = 2;
  while (nameSet.has(`${prefix}_${counter}`)) {
    counter++;
  }
  return `${prefix}_${counter}`;
}
