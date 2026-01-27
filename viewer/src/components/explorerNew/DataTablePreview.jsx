import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useParquetData } from '../../hooks/useParquetData';
import DataTable from './DataTable';
import { PiArrowClockwise } from 'react-icons/pi';

const formatBytes = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DataTablePreview = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialHash = searchParams.get('hash') ?? '';
  const [activeHash, setActiveHash] = useState(initialHash);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState(null);

  const {
    rows,
    columns,
    totalRowCount,
    page,
    pageSize,
    pageCount,
    setPage,
    setPageSize,
    sorting,
    setSorting,
    isLoading,
    isQuerying,
    error,
    reload,
  } = useParquetData({
    url: activeHash ? `/api/files/${activeHash}/` : null,
    tableName: activeHash || 'preview',
  });

  // Fetch file list on mount
  useEffect(() => {
    let cancelled = false;
    const fetchFiles = async () => {
      setFilesLoading(true);
      setFilesError(null);
      try {
        const res = await fetch('/api/files/');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setFiles(data);
      } catch (err) {
        if (!cancelled) setFilesError(err.message || String(err));
      } finally {
        if (!cancelled) setFilesLoading(false);
      }
    };
    fetchFiles();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync hash to URL when it changes
  useEffect(() => {
    if (activeHash) {
      setSearchParams({ hash: activeHash }, { replace: true });
    }
  }, [activeHash, setSearchParams]);

  const handleFileSelect = useCallback(e => {
    const hash = e.target.value;
    if (hash) {
      setActiveHash(hash);
    }
  }, []);

  const handleColumnProfileRequest = useCallback(columnName => {
    console.log('[DataTablePreview] Column profile requested:', columnName);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-secondary-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          {/* File picker */}
          <label className="text-xs font-medium text-secondary-500 whitespace-nowrap">
            Parquet File:
          </label>
          <select
            value={activeHash}
            onChange={handleFileSelect}
            disabled={filesLoading}
            className="text-sm border border-secondary-300 rounded-lg px-3 py-1.5 min-w-[300px] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary transition-all bg-white"
          >
            <option value="">
              {filesLoading ? 'Loading files...' : '-- Select a file --'}
            </option>
            {files.map(f => (
              <option key={f.hash} value={f.hash}>
                {f.hash} ({formatBytes(f.size)})
              </option>
            ))}
          </select>

          {activeHash && (
            <button
              onClick={reload}
              className="flex items-center gap-1 text-sm text-secondary-500 hover:text-secondary-700 rounded-lg px-2 py-1.5 hover:bg-secondary-100 transition-colors"
              title="Reload data"
            >
              <PiArrowClockwise size={14} />
            </button>
          )}

          {/* Status info */}
          {activeHash && !isLoading && !error && columns.length > 0 && (
            <span className="text-xs text-secondary-400 ml-auto">
              {columns.length} columns, {totalRowCount.toLocaleString()} rows
            </span>
          )}
          {filesError && (
            <span className="text-xs text-highlight ml-auto">
              Failed to load file list: {filesError}
            </span>
          )}
        </div>
      </div>

      {/* DataTable area */}
      <div className="flex-1 min-h-0 p-4">
        {!activeHash ? (
          <div className="flex items-center justify-center h-full border border-secondary-200 rounded bg-white">
            <span className="text-sm text-secondary-400">Select a parquet file to preview</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full border border-secondary-200 rounded bg-white">
            <span className="text-sm text-highlight">{error}</span>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            totalRowCount={totalRowCount}
            page={page}
            pageSize={pageSize}
            pageCount={pageCount}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sorting={sorting}
            onSortChange={setSorting}
            onColumnProfileRequest={handleColumnProfileRequest}
            isLoading={isLoading}
            isQuerying={isQuerying}
            height="100%"
          />
        )}
      </div>
    </div>
  );
};

export default DataTablePreview;
