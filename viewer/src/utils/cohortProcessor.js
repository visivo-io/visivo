import { duckdbService } from '../services/duckdbService';

/**
 * Cohort Processor for client-side data grouping
 * Handles the transformation of trace data based on cohort configuration
 */
class CohortProcessor {
  /**
   * Process trace data with cohort configuration
   * @param {Object} traceData - Raw trace data from data.json
   * @param {Object} traceConfig - Trace configuration from project.json
   * @returns {Promise<Object>} Processed data ready for chart rendering
   */
  async processTraceData(traceData, traceConfig) {
    try {
      const cohortOn = traceConfig?.cohort_on;
      
      if (!cohortOn) {
        // No cohort configuration, return data under 'values' key
        return { values: traceData };
      }

      // Use DuckDB to process cohorts
      const cohortedData = await this.groupByCohort(traceData, cohortOn);
      return cohortedData;
    } catch (error) {
      console.error('Failed to process trace data:', error);
      // Fallback to non-cohorted data
      return { values: traceData };
    }
  }

  /**
   * Group data by cohort using DuckDB WASM
   * @param {Object} data - Raw data object with column arrays
   * @param {string} cohortOn - Column name or expression to group by
   * @returns {Promise<Object>} Data grouped by cohort values
   */
  async groupByCohort(data, cohortOn) {
    try {
      // Handle different cohort_on formats
      const cohortExpression = this.parseCohortExpression(cohortOn);
      
      // Use DuckDB service to create cohorts
      const cohortedData = await duckdbService.createCohorts(data, cohortExpression);
      
      return cohortedData;
    } catch (error) {
      console.error('Cohort grouping failed:', error);
      throw new Error(`Cohort processing failed: ${error.message}`);
    }
  }

  /**
   * Parse cohort_on expression to SQL-compatible format
   * @param {string} cohortOn - Cohort expression from trace configuration
   * @returns {string} SQL-compatible expression
   */
  parseCohortExpression(cohortOn) {
    if (!cohortOn || typeof cohortOn !== 'string') {
      throw new Error('Invalid cohort_on expression');
    }

    // Handle query syntax: ?{expression} -> expression
    const queryMatch = cohortOn.match(/^\?\{(.+)\}$/);
    if (queryMatch) {
      return queryMatch[1];
    }

    // Handle column syntax: column(name) -> "name"
    const columnMatch = cohortOn.match(/^column\(([^)]+)\)$/);
    if (columnMatch) {
      return `"${columnMatch[1]}"`;
    }

    // Handle quoted strings: 'literal' -> 'literal'
    if (cohortOn.match(/^['"].*['"]$/)) {
      return cohortOn;
    }

    // Default: treat as column name, add quotes
    return `"${cohortOn}"`;
  }

  /**
   * Transform cohorted data to chart-compatible format
   * @param {Object} cohortedData - Data grouped by cohorts
   * @returns {Object} Chart-ready data structure
   */
  transformToChartFormat(cohortedData) {
    // The cohorted data is already in the correct format for charts
    // Each cohort key maps to an object with column arrays
    return cohortedData;
  }

  /**
   * Extract unique cohort values from data
   * @param {Object} data - Raw data object
   * @param {string} cohortColumn - Column name containing cohort values
   * @returns {Array} Array of unique cohort values
   */
  extractCohortValues(data, cohortColumn) {
    if (!data[cohortColumn]) {
      return [];
    }

    const values = Array.isArray(data[cohortColumn]) 
      ? data[cohortColumn] 
      : [data[cohortColumn]];
    
    return [...new Set(values)].filter(v => v != null);
  }

  /**
   * Validate trace data structure
   * @param {Object} data - Data to validate
   * @returns {boolean} True if data structure is valid
   */
  isValidTraceData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const columns = Object.keys(data);
    if (columns.length === 0) {
      return false;
    }

    // Check if all columns have the same length (if arrays)
    const lengths = columns.map(col => {
      const columnData = data[col];
      return Array.isArray(columnData) ? columnData.length : 1;
    });

    return lengths.every(len => len === lengths[0]);
  }

  /**
   * Create preview of cohort processing results
   * @param {Object} data - Raw data
   * @param {string} cohortOn - Cohort expression
   * @returns {Promise<Object>} Preview information
   */
  async previewCohorts(data, cohortOn) {
    try {
      if (!cohortOn) {
        return {
          cohortCount: 1,
          cohorts: ['values'],
          sampleData: { values: data }
        };
      }

      const cohortExpression = this.parseCohortExpression(cohortOn);
      const cohortedData = await this.groupByCohort(data, cohortExpression);
      
      return {
        cohortCount: Object.keys(cohortedData).length,
        cohorts: Object.keys(cohortedData),
        sampleData: cohortedData
      };
    } catch (error) {
      console.error('Failed to preview cohorts:', error);
      return {
        cohortCount: 1,
        cohorts: ['values'],
        sampleData: { values: data },
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const cohortProcessor = new CohortProcessor();

// Export class for testing
export { CohortProcessor };