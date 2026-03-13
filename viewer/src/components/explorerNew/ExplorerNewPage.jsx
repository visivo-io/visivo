import React, { useState, useEffect, useCallback } from 'react';
import { PiCaretDown, PiSpinner } from 'react-icons/pi';
import SchemaBrowser from './SchemaBrowser/SchemaBrowser';
import SQLEditor from './SQLEditor';
import { fetchSourceSchemaJobs } from '../../api/sourceSchemaJobs';

const ExplorerNewPage = () => {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sql, setSql] = useState('');

  // Load sources on mount
  useEffect(() => {
    const loadSources = async () => {
      setSourcesLoading(true);
      try {
        const data = await fetchSourceSchemaJobs();
        setSources(data || []);
        if (data && data.length > 0) {
          setSelectedSource(data[0].source_name);
        }
      } catch (err) {
        console.error('Failed to load sources:', err);
      } finally {
        setSourcesLoading(false);
      }
    };
    loadSources();
  }, []);

  const handleSourceChange = useCallback(e => {
    setSelectedSource(e.target.value || null);
  }, []);

  const handleTableSelect = useCallback(({ sourceName, table }) => {
    const tableRef = `SELECT * FROM ${table}`;
    setSql(prevSql => {
      if (!prevSql.trim()) {
        return tableRef;
      }
      return prevSql + '\n' + tableRef;
    });

    if (sourceName) {
      setSelectedSource(sourceName);
    }
  }, []);

  const handleSqlSave = useCallback(value => {
    setSql(value);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50" data-testid="explorer-new-page">
      {/* Source selector header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <label htmlFor="source-selector" className="text-sm font-medium text-gray-700">
            Source:
          </label>
          {sourcesLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <PiSpinner className="animate-spin" size={16} />
              <span className="text-sm">Loading sources...</span>
            </div>
          ) : sources.length === 0 ? (
            <span className="text-sm text-gray-500">No sources configured</span>
          ) : (
            <div className="relative">
              <select
                id="source-selector"
                value={selectedSource || ''}
                onChange={handleSourceChange}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all cursor-pointer"
                data-testid="source-selector"
              >
                <option value="">Select a source</option>
                {sources.map(source => (
                  <option key={source.source_name} value={source.source_name}>
                    {source.source_name}
                  </option>
                ))}
              </select>
              <PiCaretDown
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                size={14}
              />
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Schema Browser */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white overflow-hidden">
          <SchemaBrowser onTableSelect={handleTableSelect} />
        </div>

        {/* Center: SQL Editor */}
        <div className="flex-1 overflow-hidden p-4">
          <SQLEditor
            sourceName={selectedSource}
            initialValue={sql}
            onSave={handleSqlSave}
            height="250px"
            resultsHeight="calc(100% - 300px)"
          />
        </div>
      </div>
    </div>
  );
};

export default ExplorerNewPage;
