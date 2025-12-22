import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap, addEdge, applyEdgeChanges } from 'react-flow-renderer';
import useStore from '../../../stores/store';
import { useLineageDag } from './useSourceDag';
import SourceNode from './SourceNode';
import ModelNode from './ModelNode';
import { EditPanel, CreateButton } from '../common';
import { Button } from '../../styled/Button';
import { MdOutlineZoomOutMap } from 'react-icons/md';

/**
 * Parse selector for sources and models
 * Supports: name, +name+, comma-separated list
 */
const parseSelector = (selector, sources, models) => {
  if (!selector.trim()) {
    // Return all node IDs
    const sourceIds = (sources || []).map(s => `source-${s.name}`);
    const modelIds = (models || []).map(m => `model-${m.name}`);
    return new Set([...sourceIds, ...modelIds]);
  }

  const sourceNames = new Set((sources || []).map(s => s.name));
  const modelNames = new Set((models || []).map(m => m.name));
  const terms = selector.split(',').map(term => term.trim());
  const selected = new Set();

  terms.forEach(term => {
    // Remove + modifiers and extract the name (and optional prefix)
    let name = term.replace(/^\d*\+/, '').replace(/\+\d*$/, '');

    // Check if it already has a prefix
    if (name.startsWith('source-') || name.startsWith('model-')) {
      selected.add(name);
    } else {
      // Try to match as source or model name
      if (sourceNames.has(name)) {
        selected.add(`source-${name}`);
      }
      if (modelNames.has(name)) {
        selected.add(`model-${name}`);
      }
    }
  });

  return selected;
};

/**
 * LineageNew - New lineage view for sources and models
 * Supports drag-to-connect edges between sources and models
 */
const LineageNew = () => {
  // Sources
  const sources = useStore(state => state.sources);
  const fetchSources = useStore(state => state.fetchSources);
  const sourcesLoading = useStore(state => state.sourcesLoading);
  const sourcesError = useStore(state => state.sourcesError);

  // Models
  const models = useStore(state => state.models);
  const fetchModels = useStore(state => state.fetchModels);
  const saveModel = useStore(state => state.saveModel);
  const modelsLoading = useStore(state => state.modelsLoading);

  // Selector/filter state
  const [selector, setSelector] = useState('');

  // Editing state
  const [editingSource, setEditingSource] = useState(null);
  const [editingModel, setEditingModel] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createObjectType, setCreateObjectType] = useState('source');

  const reactFlowInstance = useRef(null);

  // Fetch sources and models on mount
  useEffect(() => {
    fetchSources();
    fetchModels();
  }, [fetchSources, fetchModels]);

  // Get DAG data
  const { nodes: dagNodes, edges: dagEdges } = useLineageDag();

  // Parse selector and filter nodes
  const selectedIds = useMemo(
    () => parseSelector(selector, sources, models),
    [selector, sources, models]
  );

  // Filter and add onEdit handler to each node's data
  const nodes = useMemo(() => {
    return dagNodes
      .filter(node => selectedIds.has(node.id))
      .map(node => ({
        ...node,
        data: {
          ...node.data,
          onEdit: obj => {
            if (node.data.objectType === 'model') {
              setEditingModel(obj);
              setEditingSource(null);
            } else {
              setEditingSource(obj);
              setEditingModel(null);
            }
            setIsCreating(false);
          },
        },
      }));
  }, [dagNodes, selectedIds]);

  // Filter edges to only show edges between visible nodes
  const edges = useMemo(() => {
    return dagEdges.filter(
      edge => selectedIds.has(edge.source) && selectedIds.has(edge.target)
    );
  }, [dagEdges, selectedIds]);

  // Node types for React Flow
  const nodeTypes = useMemo(
    () => ({
      sourceNode: SourceNode,
      modelNode: ModelNode,
    }),
    []
  );

  // Handle node click - set selector to focus on this node
  const handleNodeClick = useCallback((event, node) => {
    setSelector(`+${node.id}+`);
    if (node.data.objectType === 'model') {
      setEditingModel(node.data.model);
      setEditingSource(null);
    } else {
      setEditingSource(node.data.source);
      setEditingModel(null);
    }
    setIsCreating(false);
  }, []);

  // Handle new edge connection (drag from source to model)
  const handleConnect = useCallback(
    async params => {
      // Only allow connections from sources to models
      if (!params.source.startsWith('source-') || !params.target.startsWith('model-')) {
        return;
      }

      const sourceName = params.source.replace('source-', '');
      const modelName = params.target.replace('model-', '');

      // Find the model and update its source reference
      const model = models.find(m => m.name === modelName);
      if (model) {
        const updatedConfig = {
          ...model.config,
          name: model.name,
          sql: model.sql || model.config?.sql,
          source: `\${ref(${sourceName})}`,
        };
        await saveModel(modelName, updatedConfig);
        await fetchModels();
      }
    },
    [models, saveModel, fetchModels]
  );

  // Handle edge deletion
  const handleEdgesDelete = useCallback(
    async deletedEdges => {
      for (const edge of deletedEdges) {
        if (edge.target.startsWith('model-')) {
          const modelName = edge.target.replace('model-', '');
          const model = models.find(m => m.name === modelName);
          if (model) {
            const updatedConfig = {
              ...model.config,
              name: model.name,
              sql: model.sql || model.config?.sql,
              source: null,
            };
            await saveModel(modelName, updatedConfig);
          }
        }
      }
      await fetchModels();
    },
    [models, saveModel, fetchModels]
  );

  // Zoom to fit all visible nodes
  const handleZoomToExtents = useCallback(() => {
    if (reactFlowInstance.current) {
      reactFlowInstance.current.fitView({
        padding: 0.2,
        duration: 500,
      });
    }
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

  // Fit view when selection changes
  useEffect(() => {
    if (reactFlowInstance.current && nodes.length > 0) {
      setTimeout(() => {
        reactFlowInstance.current.fitView({ padding: 0.2, duration: 300 });
      }, 100);
    }
  }, [nodes.length, selectedIds]);

  const isPanelOpen = editingSource || editingModel || isCreating;
  const isLoading = sourcesLoading || modelsLoading;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Selector input bar */}
      <div className="flex flex-row gap-2 px-2 py-2 bg-white border-b border-gray-200">
        <input
          type="text"
          value={selector}
          onChange={e => setSelector(e.target.value)}
          placeholder="e.g., 'source_name', 'model_name', or '+name+'"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <Button onClick={() => setSelector('')}>Clear</Button>
        <Button onClick={handleZoomToExtents}>
          <MdOutlineZoomOutMap />
        </Button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* DAG area */}
        <div className={`flex-1 relative ${isPanelOpen ? 'mr-96' : ''} transition-all duration-200`}>
          {/* Loading state */}
          {isLoading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
              <div className="text-gray-500">Loading...</div>
            </div>
          )}

          {/* Error state */}
          {sourcesError && (
            <div className="absolute top-4 left-4 right-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm z-10">
              Error loading sources: {sourcesError}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && dagNodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-lg mb-2">No sources or models yet</div>
              <div className="text-gray-400 text-sm">
                Click the + button to create your first source or model
              </div>
            </div>
          )}

          {/* No matches state */}
          {!isLoading && dagNodes.length > 0 && nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-lg mb-2">No matching objects</div>
              <div className="text-gray-400 text-sm">
                Try a different selector or click Clear
              </div>
            </div>
          )}

          {/* React Flow DAG */}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            onInit={instance => {
              reactFlowInstance.current = instance;
            }}
            minZoom={0.1}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            style={{ background: '#f8fafc' }}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background color="#e2e8f0" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={node => {
                const status = node.data?.status;
                const objectType = node.data?.objectType;
                if (status === 'new') return '#22c55e';
                if (status === 'modified') return '#f59e0b';
                // Different base color for models vs sources
                return objectType === 'model' ? '#6366f1' : '#94a3b8';
              }}
              style={{ background: '#f1f5f9' }}
            />
          </ReactFlow>

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
    </div>
  );
};

export default LineageNew;
