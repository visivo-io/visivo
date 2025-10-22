import React, { useState, useMemo } from 'react';
import { Tooltip } from '@mui/material';

/**
 * Dimension Pills View - Alternative visualization mode for query results
 * Shows categorical data grouped by dimension with pill-style UI and value distributions
 */
const DimensionPillsView = ({ result, cell }) => {
  const [selectedDimension, setSelectedDimension] = useState(null);
  const [selectedValue, setSelectedValue] = useState(null);

  // Parse results to extract columns and data
  const { columns, data } = useMemo(() => {
    try {
      const parsed = JSON.parse(result.results_json);
      return {
        columns: parsed.columns || [],
        data: parsed.rows || [],
      };
    } catch (err) {
      return { columns: [], data: [] };
    }
  }, [result.results_json]);

  // Analyze columns to identify dimensions (categorical) and measures (numeric)
  const { dimensions, measures, dimensionStats } = useMemo(() => {
    if (data.length === 0) {
      return { dimensions: [], measures: [], dimensionStats: {} };
    }

    const dims = [];
    const meas = [];
    const stats = {};

    columns.forEach(col => {
      const values = data.map(row => row[col]);
      const uniqueValues = new Set(values);
      const sampleValue = values.find(v => v != null);

      // Consider it a dimension if it's not a number or has few unique values
      const isNumeric = typeof sampleValue === 'number';
      const cardinality = uniqueValues.size;
      const isDimension = !isNumeric || cardinality <= Math.min(20, data.length * 0.5);

      if (isDimension) {
        dims.push(col);

        // Calculate value distribution
        const valueCounts = {};
        values.forEach(val => {
          const key = val === null || val === undefined ? '(null)' : String(val);
          valueCounts[key] = (valueCounts[key] || 0) + 1;
        });

        // Sort by count descending
        const sortedValues = Object.entries(valueCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([value, count]) => ({
            value,
            count,
            percentage: ((count / data.length) * 100).toFixed(1),
          }));

        stats[col] = {
          cardinality,
          values: sortedValues.slice(0, 50), // Limit to top 50 values
          totalCount: data.length,
          isComplete: sortedValues.length <= 50,
        };
      } else {
        meas.push(col);
      }
    });

    return { dimensions: dims, measures: meas, dimensionStats: stats };
  }, [columns, data]);

  // Select first dimension by default
  const activeDimension = selectedDimension || dimensions[0];

  const handleDimensionClick = dim => {
    setSelectedDimension(dim);
    setSelectedValue(null);
  };

  const handlePillClick = value => {
    setSelectedValue(selectedValue === value ? null : value);
  };

  if (data.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>No data to display</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Dimension Selector */}
      {dimensions.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Dimension</h3>
          <div className="flex flex-wrap gap-2">
            {dimensions.map(dim => (
              <button
                key={dim}
                onClick={() => handleDimensionClick(dim)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  dim === activeDimension
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {dim}
                <span className="ml-2 text-xs opacity-75">
                  ({dimensionStats[dim]?.cardinality} values)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Value Distribution Pills */}
      {activeDimension && dimensionStats[activeDimension] && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Values for "{activeDimension}"</h3>
            <span className="text-xs text-gray-500">
              {dimensionStats[activeDimension].isComplete
                ? `Showing all ${dimensionStats[activeDimension].cardinality} values`
                : `Showing top 50 of ${dimensionStats[activeDimension].cardinality} values`}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {dimensionStats[activeDimension].values.map(({ value, count, percentage }) => (
              <Tooltip key={value} title={`${count} rows (${percentage}%)`} placement="top" arrow>
                <button
                  onClick={() => handlePillClick(value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border-2 ${
                    selectedValue === value
                      ? 'bg-purple-600 text-white border-purple-600 shadow-lg scale-105'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[200px]">{value}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedValue === value
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Selected Value Details */}
      {selectedValue && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="text-sm font-semibold text-purple-900 mb-2">
            Selected: {activeDimension} = "{selectedValue}"
          </h4>
          <div className="text-sm text-purple-800">
            <p>
              Appears{' '}
              {dimensionStats[activeDimension].values.find(v => v.value === selectedValue)?.count}{' '}
              times (
              {
                dimensionStats[activeDimension].values.find(v => v.value === selectedValue)
                  ?.percentage
              }
              % of total)
            </p>
          </div>
        </div>
      )}

      {/* Measures Summary */}
      {measures.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Numeric Measures</h3>
          <div className="flex flex-wrap gap-2">
            {measures.map(measure => (
              <span
                key={measure}
                className="px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm font-medium"
              >
                {measure}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Switch to Table view to see numeric values</p>
        </div>
      )}

      {dimensions.length === 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>No categorical dimensions found.</strong> This view works best with data
            containing text or categorical columns. All columns in this result appear to be numeric
            measures.
          </p>
        </div>
      )}
    </div>
  );
};

export default DimensionPillsView;
