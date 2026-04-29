import React, { useEffect, useState } from 'react';
import { PiX } from 'react-icons/pi';

/**
 * Build the preview URL for a given source/database/table (and optional schema).
 * Exported for use in tests.
 */
export const buildPreviewUrl = ({ source, database, table, schema, limit = 100 }) => {
  const base = schema
    ? `/api/project/sources/${encodeURIComponent(source)}/databases/${encodeURIComponent(
        database
      )}/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/preview/`
    : `/api/project/sources/${encodeURIComponent(source)}/databases/${encodeURIComponent(
        database
      )}/tables/${encodeURIComponent(table)}/preview/`;
  return `${base}?limit=${encodeURIComponent(limit)}`;
};

const formatCellValue = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

/**
 * DataPreviewModal - Modal that fetches and renders the first N rows of a table.
 *
 * Props:
 *   - source:   (string) source name
 *   - database: (string) database name
 *   - table:    (string) table name
 *   - schema:   (string|null) optional schema name
 *   - limit:    (number) row limit (default 100, max 1000)
 *   - onClose:  (function) called when the modal is dismissed
 */
const DataPreviewModal = ({ source, database, table, schema = null, limit = 100, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Fetch preview rows on mount / when key inputs change.
  useEffect(() => {
    let cancelled = false;

    const url = buildPreviewUrl({ source, database, table, schema, limit });
    setData(null);
    setError(null);

    fetch(url)
      .then(async response => {
        if (!response.ok) {
          let detail = response.statusText;
          try {
            const body = await response.json();
            detail = body.error || body.message || detail;
          } catch {
            // fall through with statusText
          }
          throw new Error(`Preview failed (${response.status}): ${detail}`);
        }
        return response.json();
      })
      .then(json => {
        if (!cancelled) setData(json);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [source, database, table, schema, limit]);

  // Close on Escape.
  useEffect(() => {
    const onKeyDown = e => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const heading = schema ? `${schema}.${table}` : table;

  return (
    <div
      data-testid="data-preview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative bg-white rounded-lg w-[90vw] max-w-5xl max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-secondary-100">
          <h2 className="text-lg font-medium text-secondary-900">{heading}</h2>
          <p className="text-sm text-secondary-600">
            First {limit} rows from <span className="font-mono">{source}</span>
            {data?.truncated ? ' (truncated)' : ''}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto" data-testid="data-preview-body">
          {!data && !error && (
            <div className="p-8 text-center text-secondary-500" data-testid="preview-loading">
              Loading...
            </div>
          )}
          {error && (
            <div
              className="p-8 text-center text-highlight-700"
              data-testid="preview-error"
            >
              Error: {error}
            </div>
          )}
          {data && data.columns && data.columns.length > 0 && (
            <table className="w-full text-xs" data-testid="preview-table">
              <thead className="sticky top-0 bg-secondary-100">
                <tr>
                  {data.columns.map(col => (
                    <th
                      key={col.name}
                      className="text-left px-2 py-1 font-medium text-secondary-700 border-b border-secondary-200"
                    >
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="even:bg-secondary-50 hover:bg-primary-50"
                    data-testid={`preview-row-${i}`}
                  >
                    {data.columns.map(col => (
                      <td
                        key={col.name}
                        className="px-2 py-1 max-w-xs truncate text-secondary-800"
                        title={formatCellValue(row[col.name])}
                      >
                        {formatCellValue(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data && (!data.rows || data.rows.length === 0) && !error && (
            <div
              className="p-8 text-center text-secondary-500"
              data-testid="preview-empty"
            >
              No rows returned.
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-2 rounded hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900 transition-colors"
          aria-label="Close preview"
          data-testid="preview-close-button"
        >
          <PiX size={18} />
        </button>
      </div>
    </div>
  );
};

export default DataPreviewModal;
