import { duckdbService } from './duckdbService';
import { convertDotKeysToNestedObject, mergeStaticPropertiesAndData } from '../models/Trace';

/**
 * DataProcessor for client-side trace data processing
 * Handles end-to-end transformation from raw data to trace objects
 */
class DataProcessor {
  constructor() {
    this.duckdb = duckdbService;
  }

  /**
   * Process multiple traces with their configurations
   * @param {Array} tracesConfig - Array of trace configurations
   * @param {Object} rawTracesData - Raw trace data mapping
   * @returns {Promise<Object>} Object mapping trace names to arrays of trace objects
   */
  async processTraces(tracesConfig, rawTracesData) {
    await this.duckdb.initialize();
    
    const results = {};
    
    // Process each trace
    for (const traceConfig of tracesConfig) {
      const rawData = rawTracesData[traceConfig.name];
      if (!rawData) {
        console.warn(`No raw data available for trace: ${traceConfig.name}`);
        results[traceConfig.name] = [];
        continue;
      }
      
      try {
        results[traceConfig.name] = await this.processTrace(traceConfig, rawData);
      } catch (error) {
        console.error(`Failed to process trace ${traceConfig.name}:`, error);
        // Fallback to single trace object with raw data
        results[traceConfig.name] = [this.createTraceObject(rawData, traceConfig, 'values')];
      }
    }
    
    return results;
  }

  /**
   * Process a single trace with its configuration
   * @param {Object} traceConfig - Trace configuration from project.json
   * @param {Object} rawTraceData - Raw trace data from data.json
   * @returns {Promise<Array>} Array of trace objects (one per cohort)
   */
  async processTrace(traceConfig, rawTraceData) {
    const tableName = `trace_${traceConfig.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    
    try {
      // Load raw data into DuckDB
      await this.duckdb.loadData(tableName, rawTraceData);
      
      if (!traceConfig.cohort_on) {
        // No cohort grouping - return single trace object
        return [this.createTraceObject(rawTraceData, traceConfig, 'values')];
      }
      
      // Execute cohort grouping query
      const cohortQuery = this.buildCohortQuery(tableName, traceConfig.cohort_on);
      const cohortResults = await this.duckdb.executeQuery(cohortQuery);
      
      // Transform results to trace objects
      return this.transformToTraceObjects(cohortResults, traceConfig);
      
    } finally {
      // Cleanup temporary table
      try {
        await this.duckdb.executeQuery(`DROP TABLE IF EXISTS ${tableName}`);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup table ${tableName}:`, cleanupError);
      }
    }
  }

  /**
   * Build cohort grouping SQL query
   * @param {string} tableName - Name of the temporary table
   * @param {string} cohortOn - Cohort expression from trace configuration
   * @returns {string} SQL query for cohort grouping
   */
  buildCohortQuery(tableName, cohortOn) {
    const cohortExpression = this.parseCohortExpression(cohortOn);
    
    return `
      SELECT 
        ${cohortExpression} as cohort_value,
        *
      FROM ${tableName}
      WHERE ${cohortExpression} IS NOT NULL
      ORDER BY cohort_value
    `;
  }

  /**
   * Transform cohort query results to trace objects
   * @param {Array} cohortResults - Results from cohort query
   * @param {Object} traceConfig - Trace configuration
   * @returns {Array} Array of trace objects
   */
  transformToTraceObjects(cohortResults, traceConfig) {
    if (cohortResults.length === 0) {
      return [this.createTraceObject({}, traceConfig, 'values')];
    }

    // Group results by cohort value
    const groupedData = this.groupResultsByCohort(cohortResults);
    
    // Create trace object for each cohort
    return Object.entries(groupedData).map(([cohortName, cohortData]) => {
      return this.createTraceObject(cohortData, traceConfig, cohortName);
    });
  }

  /**
   * Group query results by cohort value
   * @param {Array} results - Query results with cohort_value column
   * @returns {Object} Data grouped by cohort values
   */
  groupResultsByCohort(results) {
    const grouped = {};
    
    results.forEach(row => {
      const cohortValue = row.cohort_value;
      delete row.cohort_value; // Remove cohort column from data
      
      if (!grouped[cohortValue]) {
        grouped[cohortValue] = {};
        // Initialize arrays for each column
        Object.keys(row).forEach(col => {
          grouped[cohortValue][col] = [];
        });
      }
      
      // Add row data to appropriate cohort
      Object.keys(row).forEach(col => {
        grouped[cohortValue][col].push(row[col]);
      });
    });
    
    return grouped;
  }

  /**
   * Create a trace object from data and configuration
   * @param {Object} data - Processed data for the trace
   * @param {Object} traceConfig - Trace configuration
   * @param {string} cohortName - Name of the cohort (or 'values' for non-cohorted)
   * @returns {Object} Complete trace object ready for rendering
   */
  createTraceObject(data, traceConfig, cohortName) {
    // Convert flat data to nested object structure
    const traceDatum = convertDotKeysToNestedObject(data);
    
    // Clone trace props to avoid mutating original config
    const traceProps = structuredClone(traceConfig.props);
    
    // Merge static properties with data, add cohort name
    return mergeStaticPropertiesAndData(traceProps, traceDatum, cohortName);
  }

  /**
   * Parse cohort_on expression to SQL-compatible format
   * Moved from cohortProcessor for centralized logic
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

    // Check if all columns have consistent structure
    const lengths = columns.map(col => {
      const columnData = data[col];
      return Array.isArray(columnData) ? columnData.length : 1;
    });

    return lengths.every(len => len === lengths[0]);
  }

  /**
   * Get cohort values from processed data for preview
   * @param {Object} data - Raw data
   * @param {string} cohortOn - Cohort expression
   * @returns {Promise<Array>} Array of unique cohort values
   */
  async getCohortValues(data, cohortOn) {
    if (!cohortOn) {
      return ['values'];
    }

    const tableName = `preview_table_${Date.now()}`;
    
    try {
      await this.duckdb.initialize();
      await this.duckdb.loadData(tableName, data);
      
      const cohortExpression = this.parseCohortExpression(cohortOn);
      const query = `
        SELECT DISTINCT ${cohortExpression} as cohort_value 
        FROM ${tableName} 
        WHERE ${cohortExpression} IS NOT NULL
        ORDER BY cohort_value
      `;
      
      const results = await this.duckdb.executeQuery(query);
      return results.map(row => row.cohort_value);
      
    } catch (error) {
      console.error('Failed to get cohort values:', error);
      return ['values'];
    } finally {
      try {
        await this.duckdb.executeQuery(`DROP TABLE IF EXISTS ${tableName}`);
      } catch (cleanupError) {
        console.warn(`Failed to cleanup preview table: ${cleanupError}`);
      }
    }
  }
}

// Export singleton instance
export const dataProcessor = new DataProcessor();

// Export class for testing
export { DataProcessor };