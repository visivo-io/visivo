import React, { useState, useEffect, useCallback } from 'react';
import { PiCaretDown, PiSpinner } from 'react-icons/pi';
import SchemaBrowser from './SchemaBrowser/SchemaBrowser';
import SQLEditor from './SQLEditor';
import ColumnProfilePanel from './ColumnProfilePanel';
import { fetchSourceSchemaJobs } from '../../api/sourceSchemaJobs';

const ExplorerNewPage = () => {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sql, setSql] = useState('');

  // Column profile panel state
  const [profileColumn, setProfileColumn] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [profileDb, setProfileDb] = useState(null);
  const [profileTableName, setProfileTableName] = useState(null);
  const [profileRowCount, setProfileRowCount] = useState(null);

  // Load sources on mount
  useEffect(() => {
    const loadSources = async () => {
      setSourcesLoading(true);
      try {
        const data = await fetchSourceSchemaJobs();
        setSources(data || []);
        // Auto-select first source if available
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

  // Handle source selection change
  const handleSourceChange = useCallback(e => {
    setSelectedSource(e.target.value || null);
  }, []);

  // Handle table selection from SchemaBrowser (double-click)
  const handleTableSelect = useCallback(({ sourceName, table }) => {
    // Insert table reference into SQL editor
    const tableRef = `SELECT * FROM ${table}`;
    setSql(prevSql => {
      // If editor is empty, set the full select statement
      if (!prevSql.trim()) {
        return tableRef;
      }
      // Otherwise append to current position or end
      return prevSql + '\n' + tableRef;
    });

    // Also update selected source to match the table's source
    if (sourceName) {
      setSelectedSource(sourceName);
    }
  }, []);

  // Handle create model action from SchemaBrowser
  const handleCreateModel = useCallback(({ sourceName, table }) => {
    // For now, just log - future implementation could navigate to model creator
    console.log('Create model requested for:', sourceName, table);
  }, []);

  // Handle SQL changes
  const handleSqlSave = useCallback(value => {
    setSql(value);
  }, []);

  // Handle column profile close
  const handleCloseProfile = useCallback(() => {
    setProfileColumn(null);
    setProfileData(null);
    setProfileDb(null);
    setProfileTableName(null);
    setProfileRowCount(null);
  }, []);

  const isProfileOpen = !!profileColumn && !!profileData;

  return (
    <div className="flex flex-col h-full bg-secondary-50" data-testid="explorer-new-page">
      {/* Source selector header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-secondary-200 bg-white">
        <div className="flex items-center gap-3">
          <label htmlFor="source-selector" className="text-sm font-medium text-secondary-700">
            Source:
          </label>
          {sourcesLoading ? (
            <div className="flex items-center gap-2 text-secondary-400">
              <PiSpinner className="animate-spin" size={16} />
              <span className="text-sm">Loading sources...</span>
            </div>
          ) : sources.length === 0 ? (
            <span className="text-sm text-secondary-500">No sources configured</span>
          ) : (
            <div className="relative">
              <select
                id="source-selector"
                value={selectedSource || ''}
                onChange={handleSourceChange}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary transition-all cursor-pointer"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-400 pointer-events-none"
                size={14}
              />
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Schema Browser */}
        <div className="w-64 flex-shrink-0 border-r border-secondary-200 bg-white overflow-hidden">
          <SchemaBrowser onTableSelect={handleTableSelect} onCreateModel={handleCreateModel} />
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

        {/* Right: Column Profile Panel (conditional) */}
        <ColumnProfilePanel
          column={profileColumn}
          profile={profileData}
          db={profileDb}
          tableName={profileTableName}
          rowCount={profileRowCount}
          isOpen={isProfileOpen}
          onClose={handleCloseProfile}
        />
      </div>
    </div>
  );
};

export default ExplorerNewPage;
