/** 
 * @param {String} name 
 * @returns 
 */
export const itemNameToSlug = (name = "") => {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/\[|\]/g, '')    // Remove square brackets
    .replace(/\./g, '-')      // Replace dots with hyphens
}