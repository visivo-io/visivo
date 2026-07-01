/**
 * Test fixtures for SchemaEditor integration tests
 * Each fixture contains valid JSON examples for the corresponding chart type
 */

import scatterExamples from './scatterExamples.json';
import barExamples from './barExamples.json';
import pieExamples from './pieExamples.json';

export const FIXTURES = {
  scatter: scatterExamples,
  bar: barExamples,
  pie: pieExamples,
};

/**
 * Get fixtures for a chart type
 * @param {string} chartType - The chart type (e.g., 'scatter', 'bar', 'pie')
 * @returns {object|null} The fixtures or null if not found
 */
export function getFixtures(chartType) {
  return FIXTURES[chartType] || null;
}

/**
 * Get all valid examples for a chart type
 * @param {string} chartType - The chart type
 * @returns {Array} Array of valid example values
 */
export function getValidExamples(chartType) {
  const fixtures = getFixtures(chartType);
  return fixtures?.valid?.map(f => f.value) || [];
}
