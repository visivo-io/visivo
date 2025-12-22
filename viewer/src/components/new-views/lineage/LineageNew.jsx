import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'react-flow-renderer';
import useStore from '../../../stores/store';
import useSourceDag from './useSourceDag';
import SourceNode from './SourceNode';
import { EditPanel, CreateButton } from '../common';
import { Button } from '../../styled/Button';
import { MdOutlineZoomOutMap } from 'react-icons/md';

/**
 * Parse selector for sources (simplified version of graphUtils.parseSelector)
 * Supports: name, +name+, comma-separated list
 * Since sources have no parents/children, the + modifiers just select the source itself
 */
const parseSourceSelector = (selector, sources) => {
  if (!selector.trim()) {
    return new Set(sources.map(s => s.name));
  }

  const sourceNames = new Set(sources.map(s => s.name));
  const terms = selector.split(',').map(term => term.trim());
  const selected = new Set();

  terms.forEach(term => {
    // Remove + modifiers and extract the name
    const name = term.replace(/^\d*\+/, '').replace(/\+\d*$/, '');
    if (sourceNames.has(name)) {
      selected.add(name);
    }
  });

  return selected;
};

/**
 * LineageNew - New lineage view using only sourceStore
 * Completely independent of namedChildren/editorStore
 */
const LineageNew = () => {
  const sources = useStore(state => state.sources);
  const fetchSources = useStore(state => state.fetchSources);
  const sourcesLoading = useStore(state => state.sourcesLoading);
  const sourcesError = useStore(state => state.sourcesError);

  // Selector/filter state
  const [selector, setSelector] = useState('');

  // Editing state
  const [editingSource, setEditingSource] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const reactFlowInstance = useRef(null);

  // Fetch sources on mount
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Get DAG data
  const { nodes: dagNodes, edges } = useSourceDag();

  // Parse selector and filter nodes
  const selectedNames = useMemo(
    () => parseSourceSelector(selector, sources || []),
    [selector, sources]
  );

  // Filter and add onEdit handler to each node's data
  const nodes = useMemo(() => {
    return dagNodes
      .filter(node => selectedNames.has(node.id))
      .map(node => ({
        ...node,
        data: {
          ...node.data,
          onEdit: source => {
            setEditingSource(source);
            setIsCreating(false);
          },
        },
      }));
  }, [dagNodes, selectedNames]);

  // Node types for React Flow
  const nodeTypes = useMemo(
    () => ({
      sourceNode: SourceNode,
    }),
    []
  );

  // Handle node click - set selector to focus on this node
  const handleNodeClick = useCallback((event, node) => {
    setSelector(`+${node.id}+`);
    setEditingSource(node.data.source);
    setIsCreating(false);
  }, []);

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

  // Fit view when selection changes
  useEffect(() => {
    if (reactFlowInstance.current && nodes.length > 0) {
      setTimeout(() => {
        reactFlowInstance.current.fitView({ padding: 0.2, duration: 300 });
      }, 100);
    }
  }, [nodes.length, selectedNames]);

  const isPanelOpen = editingSource || isCreating;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Selector input bar */}
      <div className="flex flex-row gap-2 px-2 py-2 bg-white border-b border-gray-200">
        <input
          type="text"
          value={selector}
          onChange={e => setSelector(e.target.value)}
          placeholder="e.g., 'source_name' or '+source_name+'"
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
          {sourcesLoading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
              <div className="text-gray-500">Loading sources...</div>
            </div>
          )}

          {/* Error state */}
          {sourcesError && (
            <div className="absolute top-4 left-4 right-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm z-10">
              Error loading sources: {sourcesError}
            </div>
          )}

          {/* Empty state */}
          {!sourcesLoading && dagNodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-lg mb-2">No sources yet</div>
              <div className="text-gray-400 text-sm">
                Click the + button to create your first source
              </div>
            </div>
          )}

          {/* No matches state */}
          {!sourcesLoading && dagNodes.length > 0 && nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-lg mb-2">No matching sources</div>
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
          onInit={instance => {
            reactFlowInstance.current = instance;
          }}
          minZoom={0.1}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          style={{ background: '#f8fafc' }}
        >
          <Background color="#e2e8f0" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={node => {
              const status = node.data?.status;
              if (status === 'new') return '#22c55e';
              if (status === 'modified') return '#f59e0b';
              return '#94a3b8';
            }}
            style={{ background: '#f1f5f9' }}
          />
        </ReactFlow>

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
    </div>
  );
};

export default LineageNew;
