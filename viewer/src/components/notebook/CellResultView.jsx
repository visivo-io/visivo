import React, { useState } from 'react';
import Table from '../items/Table';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import TableChartIcon from '@mui/icons-material/TableChart';
import { IconButton, Tooltip } from '@mui/material';

const CellResultView = ({ result, cell, worksheetId, project }) => {
  const [viewMode, setViewMode] = useState(cell.view_mode || 'table');

  // Parse results if they're in the backend format
  const formattedResults = result.formattedResults || {
    name: 'Query Results',
    traces: [
      {
        name: 'results',
        props: {},
        data: (() => {
          try {
            const parsed = JSON.parse(result.results_json);
            return parsed.rows.map((row, index) => ({
              id: index,
              ...row,
            }));
          } catch {
            return [];
          }
        })(),
        columns: (() => {
          try {
            const parsed = JSON.parse(result.results_json);
            return parsed.columns.map(col => ({
              header: col,
              key: col,
              accessorKey: col,
              markdown: false,
            }));
          } catch {
            return [];
          }
        })(),
      },
    ],
  };

  const queryStats =
    result.queryStats ||
    (() => {
      try {
        return JSON.parse(result.query_stats_json);
      } catch {
        return null;
      }
    })();

  const rowCount = formattedResults.traces[0]?.data?.length || 0;
  const isTruncated = result.is_truncated;

  return (
    <div className="bg-white">
      {/* Results Header */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">
            {rowCount.toLocaleString()} row{rowCount !== 1 ? 's' : ''}
            {isTruncated && (
              <span className="ml-2 text-orange-600 text-xs">(Truncated at 100,000 rows)</span>
            )}
          </span>
          {queryStats && (
            <span className="text-xs text-gray-500">
              {queryStats.executionTime}s{queryStats.source && ` • ${queryStats.source}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip title="Table View">
            <IconButton
              size="small"
              onClick={() => setViewMode('table')}
              sx={{
                color: viewMode === 'table' ? 'primary.main' : 'text.secondary',
              }}
            >
              <TableChartIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Dimension Pills View">
            <IconButton
              size="small"
              onClick={() => setViewMode('dimension_pills')}
              sx={{
                color: viewMode === 'dimension_pills' ? 'primary.main' : 'text.secondary',
              }}
            >
              <ViewColumnIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {/* Results Content */}
      <div className="max-h-[400px] overflow-auto">
        {viewMode === 'table' ? (
          <Table table={formattedResults} project={project} height={400} />
        ) : (
          <div className="p-4">
            <div className="text-sm text-gray-500">Dimension Pills view coming soon...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CellResultView;
