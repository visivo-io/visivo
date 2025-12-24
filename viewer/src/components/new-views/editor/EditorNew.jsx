import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useStore from '../../../stores/store';
import SourceSearch from './SourceSearch';
import EditPanel from '../common/EditPanel';
import CreateButton from '../common/CreateButton';
import ObjectList from '../common/ObjectList';
import ObjectTypeFilter from '../common/ObjectTypeFilter';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';

/**
 * EditorNew - New editor view for sources and models
 * Completely independent of namedChildren/editorStore
 */
const EditorNew = () => {
  // Sources
  const sources = useStore(state => state.sources);
  const fetchSources = useStore(state => state.fetchSources);
  const sourcesLoading = useStore(state => state.sourcesLoading);
  const sourcesError = useStore(state => state.sourcesError);

  // Models
  const models = useStore(state => state.models);
  const fetchModels = useStore(state => state.fetchModels);
  const modelsLoading = useStore(state => state.modelsLoading);
  const modelsError = useStore(state => state.modelsError);

  // Filter state
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editingSource, setEditingSource] = useState(null);
  const [editingModel, setEditingModel] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createObjectType, setCreateObjectType] = useState('source');

  // Fetch sources and models on mount
  useEffect(() => {
    fetchSources();
    fetchModels();
  }, [fetchSources, fetchModels]);

  // Compute object type counts
  const typeCounts = useMemo(() => {
    return {
      source: sources?.length || 0,
      model: models?.length || 0,
    };
  }, [sources, models]);

  // Filter sources by type and search query
  const filteredSources = useMemo(() => {
    if (!sources) return [];

    // If types are selected and source is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('source')) {
      return [];
    }

    let filtered = sources;

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

  // Filter models by type and search query
  const filteredModels = useMemo(() => {
    if (!models) return [];

    // If types are selected and model is not included, return empty
    if (selectedTypes.length > 0 && !selectedTypes.includes('model')) {
      return [];
    }

    let filtered = models;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        model =>
          model.name.toLowerCase().includes(query) ||
          (model.sql && model.sql.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [models, selectedTypes, searchQuery]);

  // Handle source selection
  const handleSourceSelect = useCallback(source => {
    setEditingSource(source);
    setEditingModel(null);
    setIsCreating(false);
  }, []);

  // Handle model selection
  const handleModelSelect = useCallback(model => {
    setEditingModel(model);
    setEditingSource(null);
    setIsCreating(false);
  }, []);

  // Handle create button selection
  const handleCreateSelect = useCallback(objectType => {
    setEditingSource(null);
    setEditingModel(null);
    setIsCreating(true);
    setCreateObjectType(objectType);
  }, []);

  // Handle panel close
  const handlePanelClose = useCallback(() => {
    setEditingSource(null);
    setEditingModel(null);
    setIsCreating(false);
  }, []);

  // Handle save - refresh data and close panel
  const handleSave = useCallback(async () => {
    await fetchSources();
    await fetchModels();
  }, [fetchSources, fetchModels]);

  const isPanelOpen = editingSource || editingModel || isCreating;
  const isLoading = sourcesLoading || modelsLoading;

  // Get type colors for consistent theming
  const sourceTypeConfig = getTypeByValue('source');
  const sourceColors = sourceTypeConfig?.colors || DEFAULT_COLORS;
  const SourceIcon = sourceTypeConfig?.icon;

  const modelTypeConfig = getTypeByValue('model');
  const modelColors = modelTypeConfig?.colors || DEFAULT_COLORS;
  const ModelIcon = modelTypeConfig?.icon;

  const hasNoObjects = !sources?.length && !models?.length;
  const hasNoFilteredObjects = !filteredSources.length && !filteredModels.length;

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Left sidebar - Filter, Search, and list */}
      <div
        className={`w-80 bg-white border-r border-gray-200 flex flex-col ${isPanelOpen ? 'mr-96' : ''} transition-all duration-200`}
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
          <SourceSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search by name..." />
        </div>

        {/* Loading state */}
        {isLoading && hasNoObjects && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <span>Loading...</span>
          </div>
        )}

        {/* Error state */}
        {(sourcesError || modelsError) && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            Error: {sourcesError || modelsError}
          </div>
        )}

        {/* Object Lists */}
        {!isLoading && (
          <div className="flex-1 overflow-y-auto">
            {/* Sources List */}
            {filteredSources.length > 0 && (
              <ObjectList
                objects={filteredSources}
                selectedName={editingSource?.name}
                onSelect={handleSourceSelect}
                title="Sources"
                objectType="source"
              />
            )}

            {/* Models List */}
            {filteredModels.length > 0 && (
              <ObjectList
                objects={filteredModels}
                selectedName={editingModel?.name}
                onSelect={handleModelSelect}
                title="Models"
                objectType="model"
              />
            )}
          </div>
        )}

        {/* Empty search/filter results */}
        {!isLoading && !hasNoObjects && hasNoFilteredObjects && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
            {selectedTypes.length > 0
              ? 'No objects of selected types'
              : `No objects match "${searchQuery}"`}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 bg-gray-50 relative">
        {/* Empty state */}
        {!isPanelOpen && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="flex gap-4 mb-4">
              {SourceIcon && (
                <div className={`w-12 h-12 rounded-full ${sourceColors.bg} flex items-center justify-center`}>
                  <SourceIcon className={`w-6 h-6 ${sourceColors.text}`} />
                </div>
              )}
              {ModelIcon && (
                <div className={`w-12 h-12 rounded-full ${modelColors.bg} flex items-center justify-center`}>
                  <ModelIcon className={`w-6 h-6 ${modelColors.text}`} />
                </div>
              )}
            </div>
            <div className="text-lg mb-2">Select an object to edit</div>
            <div className="text-sm">or click the + button to create a new source or model</div>
          </div>
        )}

        {/* Create button (FAB) */}
        <CreateButton onSelect={handleCreateSelect} />
      </div>

      {/* Edit Panel (right side) */}
      {isPanelOpen && (
        <div className="fixed top-12 right-0 bottom-0 z-20">
          <EditPanel
            source={editingSource}
            model={editingModel}
            objectType={createObjectType}
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
