/**
 * Shared validation utilities for named model objects.
 * Used across edit forms for Sources, Metrics, Relations, Insights, and Dimensions.
 */

// Regex pattern for valid names: must start with a letter or number,
// and contain only letters, numbers, underscores, and hyphens
export const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Validates a name field and returns an error message if invalid.
 * @param {string} name - The name to validate
 * @returns {string|null} - Error message if invalid, null if valid
 */
export function validateName(name) {
  if (!name.trim()) {
    return 'Name is required';
  }
  if (!NAME_PATTERN.test(name)) {
    return 'Name must start with a letter or number and contain only letters, numbers, underscores, and hyphens';
  }
  return null;
}
