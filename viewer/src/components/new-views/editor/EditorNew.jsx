import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useStore from '../../../stores/store';
import SourceSearch from './SourceSearch';
import { EditPanel, CreateButton, ObjectList, ObjectTypeFilter, getTypeByValue, DEFAULT_COLORS } from '../common';

/**
 * EditorNew - New editor view using only sourceStore
 * Completely independent of namedChildren/editorStore
 */
const EditorNew = () => {
  const sources = useStore(state => state.sources);
  const fetchSources = useStore(state => state.fetchSources);
  const sourcesLoading = useStore(state => state.sourcesLoading);
  const sourcesError = useStore(state => state.sourcesError);

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editingSource, setEditingSource] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch sources on mount
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Compute object type counts
  const typeCounts = useMemo(() => {
    return {
      source: sources?.length || 0,
      // Future: model: models?.length || 0,
    };
  }, [sources]);

  // Filter sources by type and search query
  const filteredSources = useMemo(() => {
    if (!sources) return [];

    let filtered = sources;

    // Filter by type (if source type is selected or no filter)
    if (selectedTypes.length > 0 && !selectedTypes.includes('source')) {
      filtered = [];
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        source =>
          source.name.toLowerCase().includes(query) ||
          (source.type && source.type.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [sources, selectedTypes, searchQuery]);

  // Handle source selection
  const handleSourceSelect = useCallback(source => {
    setEditingSource(source);
    setIsCreating(false);
  }, []);

  // Handle create button selection
  const handleCreateSelect = useCallback(objectType => {
    if (objectType === 'source') {
      setEditingSource(null);
      setIsCreating(true);
    }
    // Future: handle other object types
  }, []);

  // Handle panel close
  const handlePanelClose = useCallback(() => {
    setEditingSource(null);
    setIsCreating(false);
  }, []);

  // Handle save - refresh sources and close panel
  const handleSave = useCallback(async () => {
    await fetchSources();
    // Panel will close automatically after save
  }, [fetchSources]);

  const isPanelOpen = editingSource || isCreating;
  const selectedName = editingSource?.name;

  // Get source type colors for consistent theming
  const sourceTypeConfig = getTypeByValue('source');
  const sourceColors = sourceTypeConfig?.colors || DEFAULT_COLORS;
  const SourceIcon = sourceTypeConfig?.icon;

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left sidebar - Filter, Search, and list */}
      <div
        className={`w-80 bg-white border-r ${sourceColors.border} flex flex-col ${isPanelOpen ? 'mr-96' : ''} transition-all duration-200`}
      >
        {/* Type Filter */}
        <div className="p-3 border-b border-gray-200">
          <ObjectTypeFilter
            selectedTypes={selectedTypes}
            onChange={setSelectedTypes}
            counts={typeCounts}
          />
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <SourceSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search by name or type..." />
        </div>

        {/* Loading state */}
        {sourcesLoading && sources.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            {SourceIcon && <SourceIcon className={`w-8 h-8 mb-2 ${sourceColors.text} opacity-50`} />}
            <span>Loading sources...</span>
          </div>
        )}

        {/* Error state */}
        {sourcesError && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            Error: {sourcesError}
          </div>
        )}

        {/* Object List */}
        {!sourcesLoading && (
          <div className="flex-1 overflow-y-auto">
            <ObjectList
              objects={filteredSources}
              selectedName={selectedName}
              onSelect={handleSourceSelect}
              title="Sources"
            />
          </div>
        )}

        {/* Empty search/filter results */}
        {!sourcesLoading && sources.length > 0 && filteredSources.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
            {selectedTypes.length > 0 && !selectedTypes.includes('source')
              ? 'No objects of this type yet'
              : `No sources match "${searchQuery}"`}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 bg-gray-50 relative">
        {/* Empty state */}
        {!isPanelOpen && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            {SourceIcon && (
              <div className={`w-16 h-16 rounded-full ${sourceColors.bg} flex items-center justify-center mb-4`}>
                <SourceIcon className={`w-8 h-8 ${sourceColors.text}`} />
              </div>
            )}
            <div className="text-lg mb-2">Select an object to edit</div>
            <div className="text-sm">or click the + button to create a new one</div>
          </div>
        )}

        {/* Create button (FAB) */}
        <CreateButton onSelect={handleCreateSelect} />
      </div>

      {/* Edit Panel (right side) */}
      {isPanelOpen && (
        <div className="fixed top-14 right-0 bottom-0 z-20">
          <EditPanel
            source={editingSource}
            isCreate={isCreating}
            onClose={handlePanelClose}
            onSave={handleSave}
          />
        </div>
      )}
    </div>
  );
};

export default EditorNew;
