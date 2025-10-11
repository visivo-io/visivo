import React from 'react';

/**
 * Dimension Pills View - Alternative visualization mode for query results
 * Shows data grouped by dimensions with pill-style UI
 *
 * This is a placeholder for Phase 4 implementation
 */
const DimensionPillsView = ({ result, cell }) => {
  // Parse results to extract dimensions and measures
  let columns = [];
  let data = [];

  try {
    const parsed = JSON.parse(result.results_json);
    columns = parsed.columns || [];
    data = parsed.rows || [];
  } catch (err) {
    console.error('Failed to parse results:', err);
  }

  // Group columns into dimensions (strings) and measures (numbers)
  const dimensions = [];
  const measures = [];

  if (data.length > 0) {
    const firstRow = data[0];
    columns.forEach(col => {
      const value = firstRow[col];
      if (typeof value === 'number') {
        measures.push(col);
      } else {
        dimensions.push(col);
      }
    });
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Dimensions</h3>
        <div className="flex flex-wrap gap-2">
          {dimensions.length > 0 ? (
            dimensions.map(dim => (
              <span
                key={dim}
                className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
              >
                {dim}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-500">No dimensions found</span>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Measures</h3>
        <div className="flex flex-wrap gap-2">
          {measures.length > 0 ? (
            measures.map(measure => (
              <span
                key={measure}
                className="px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm font-medium"
              >
                {measure}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-500">No measures found</span>
          )}
        </div>
      </div>

      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> Dimension Pills view is a placeholder. Full implementation coming
          in Phase 4 with interactive filtering and drill-down capabilities.
        </p>
      </div>
    </div>
  );
};

export default DimensionPillsView;
