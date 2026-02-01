import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDuckDB } from '../../contexts/DuckDBContext';
import { loadParquetFromURL } from '../../duckdb/queries';
import { alphaHash } from '../../utils/alphaHash';
import { useTableData } from '../../hooks/useTableData';
import DataTable from '../common/DataTable';
import ColumnProfilePanel from './ColumnProfilePanel';
import { profileTableLocally } from '../../duckdb/profiling';
import useStore from '../../stores/store';
import { PiSpinner } from 'react-icons/pi';

const DataTablePreview = () => {
  const db = useDuckDB();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialName = searchParams.get('name') ?? '';

  const [selectedName, setSelectedName] = useState(initialName);
  const [tableName, setTableName] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadingParquet, setLoadingParquet] = useState(false);

  const [profileColumn, setProfileColumn] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const insights = useStore(s => s.insights);
  const insightsLoading = useStore(s => s.insightsLoading);
  const fetchInsights = useStore(s => s.fetchInsights);

  const models = useStore(s => s.models);
  const modelsLoading = useStore(s => s.modelsLoading);
  const fetchModels = useStore(s => s.fetchModels);

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
  } = useTableData({ tableName });

  useEffect(() => {
    fetchInsights();
    fetchModels();
  }, [fetchInsights, fetchModels]);

  useEffect(() => {
    if (selectedName) {
      setSearchParams({ name: selectedName }, { replace: true });
    }
  }, [selectedName, setSearchParams]);

  const handleSelect = useCallback(
    async e => {
      const name = e.target.value;
      if (!name || !db) return;

      setSelectedName(name);
      setLoadError(null);
      setLoadingParquet(true);
      setTableName(null);
      setProfileColumn(null);
      setProfileData(null);

      try {
        const hash = alphaHash(name);
        await loadParquetFromURL(db, `/api/files/${hash}/`, hash, true);
        setTableName(hash);

        // Profile data from DuckDB (non-blocking)
        setProfileLoading(true);
        profileTableLocally(db, hash)
          .then(data => setProfileData(data))
          .catch(() => {})
          .finally(() => setProfileLoading(false));
      } catch (err) {
        setLoadError(err.message || String(err));
      } finally {
        setLoadingParquet(false);
      }
    },
    [db]
  );

  // Enrich columns with null percentage from profile data
  const enrichedColumns = useMemo(() => {
    if (!profileData?.columns || !columns.length) return columns;
    const profileMap = new Map(profileData.columns.map(c => [c.name, c]));
    return columns.map(col => {
      const profile = profileMap.get(col.name);
      return profile ? { ...col, nullPercentage: profile.null_percentage ?? 0 } : col;
    });
  }, [columns, profileData]);

  // Find the profile for the selected column
  const selectedColumnProfile = useMemo(() => {
    if (!profileColumn || !profileData?.columns) return null;
    return profileData.columns.find(c => c.name === profileColumn) || null;
  }, [profileColumn, profileData]);

  const listsLoading = insightsLoading || modelsLoading;
  const displayError = loadError || error;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-secondary-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-secondary-500 whitespace-nowrap">
            Data Source:
          </label>
          <select
            value={selectedName}
            onChange={handleSelect}
            disabled={listsLoading}
            className="text-sm border border-secondary-300 rounded-lg px-3 py-1.5 min-w-[300px] focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary transition-all bg-white"
          >
            <option value="">
              {listsLoading ? 'Loading...' : '-- Select an insight or model --'}
            </option>
            {insights.length > 0 && (
              <optgroup label="Insights">
                {insights.map(i => (
                  <option key={`insight-${i.name}`} value={i.name}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            )}
            {models.length > 0 && (
              <optgroup label="Models">
                {models.map(m => (
                  <option key={`model-${m.name}`} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {(loadingParquet || profileLoading) && (
            <PiSpinner className="animate-spin text-secondary-400" size={16} />
          )}

          {tableName && !isLoading && !displayError && enrichedColumns.length > 0 && (
            <span className="text-xs text-secondary-400 ml-auto">
              {enrichedColumns.length} columns, {totalRowCount.toLocaleString()} rows
            </span>
          )}
        </div>
      </div>

      {/* DataTable area */}
      <div className="flex-1 min-h-0 flex p-4 gap-4">
        {!tableName && !loadingParquet && !displayError ? (
          <div className="flex-1 flex items-center justify-center h-full border border-secondary-200 rounded bg-white">
            <span className="text-sm text-secondary-400">
              Select an insight or model to preview its data
            </span>
          </div>
        ) : displayError ? (
          <div className="flex-1 flex items-center justify-center h-full border border-secondary-200 rounded bg-white">
            <span className="text-sm text-highlight">{displayError}</span>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <DataTable
                columns={enrichedColumns}
                rows={rows}
                totalRowCount={totalRowCount}
                page={page}
                pageSize={pageSize}
                pageCount={pageCount}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                sorting={sorting}
                onSortChange={setSorting}
                onColumnProfileRequest={colName => setProfileColumn(colName)}
                isLoading={isLoading || loadingParquet}
                isQuerying={isQuerying}
                height="100%"
              />
            </div>
            <ColumnProfilePanel
              column={profileColumn}
              profile={selectedColumnProfile}
              db={db}
              tableName={tableName}
              rowCount={profileData?.row_count}
              onClose={() => setProfileColumn(null)}
              isOpen={!!profileColumn && !!selectedColumnProfile}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DataTablePreview;
