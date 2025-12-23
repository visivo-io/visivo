import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'react-flow-renderer';
import useStore from '../../../stores/store';
import { useLineageDag } from './useLineageDag';
import SourceNode from './SourceNode';
import ModelNode from './ModelNode';
import EditPanel from '../common/EditPanel';
import CreateButton from '../common/CreateButton';
import { Button } from '../../styled/Button';
import { MdOutlineZoomOutMap } from 'react-icons/md';

/**
 * Build adjacency lists from edges for graph traversal
 */
const buildAdjacencyLists = edges => {
  const children = {}; // node -> [downstream nodes]
  const parents = {};  // node -> [upstream nodes]

  edges.forEach(edge => {
    if (!children[edge.source]) children[edge.source] = [];
    if (!parents[edge.target]) parents[edge.target] = [];
    children[edge.source].push(edge.target);
    parents[edge.target].push(edge.source);
  });

  return { children, parents };
};

/**
 * Get all descendants (downstream) of a node, optionally limited by generations
 */
const getDescendants = (startNode, children, generations = Infinity) => {
  const descendants = new Set();
  const queue = [{ node: startNode, depth: 0 }];

  while (queue.length > 0) {
    const { node, depth } = queue.shift();
    if (depth > generations) continue;
    if (!descendants.has(node)) {
      descendants.add(node);
      if (depth < generations) {
        const nodeChildren = children[node] || [];
        nodeChildren.forEach(child => queue.push({ node: child, depth: depth + 1 }));
      }
    }
  }

  return descendants;
};

/**
 * Get all ancestors (upstream) of a node, optionally limited by generations
 */
const getAncestors = (startNode, parents, generations = Infinity) => {
  const ancestors = new Set();
  const queue = [{ node: startNode, depth: 0 }];

  while (queue.length > 0) {
    const { node, depth } = queue.shift();
    if (depth > generations) continue;
    if (!ancestors.has(node)) {
      ancestors.add(node);
      if (depth < generations) {
        const nodeParents = parents[node] || [];
        nodeParents.forEach(parent => queue.push({ node: parent, depth: depth + 1 }));
      }
    }
  }

  return ancestors;
};

/**
 * Parse selector for sources and models
 * Supports dbt-style selectors:
 * - name: just that node
 * - +name: node and all ancestors (upstream)
 * - name+: node and all descendants (downstream)
 * - +name+: node and all ancestors and descendants
 * - 2+name: node and 2 generations of ancestors
 * - name+3: node and 3 generations of descendants
 * - comma-separated list of any of the above
 */
const parseSelector = (selector, nodes, edges) => {
  const allNodeIds = new Set(nodes.map(n => n.id));

  if (!selector.trim()) {
    return allNodeIds;
  }

  const { children, parents } = buildAdjacencyLists(edges);
  const terms = selector.split(',').map(term => term.trim());
  const selected = new Set();

  terms.forEach(term => {
    // Parse the selector term: [n]+name[+[n]]
    // eslint-disable-next-line no-useless-escape
    const match = term.match(/^(?:(\d*)(\+))?([^\+]+)(?:(\+)(\d*)?)?$/);

    if (!match) return;

    const ancestorDigits = match[1];
    const hasAncestorPlus = match[2] === '+';
    let nodeName = match[3];
    const hasDescendantPlus = match[4] === '+';
    const descendantDigits = match[5];

    // Resolve the node ID - try with prefixes if not already prefixed
    let nodeId = null;
    if (allNodeIds.has(nodeName)) {
      nodeId = nodeName;
    } else if (allNodeIds.has(`source-${nodeName}`)) {
      nodeId = `source-${nodeName}`;
    } else if (allNodeIds.has(`model-${nodeName}`)) {
      nodeId = `model-${nodeName}`;
    }

    if (!nodeId) return;

    // Determine ancestor generations
    let ancestorGen = 0;
    if (hasAncestorPlus) {
      ancestorGen = ancestorDigits === '' || ancestorDigits === undefined
        ? Infinity
        : parseInt(ancestorDigits, 10);
    }

    // Determine descendant generations
    let descendantGen = 0;
    if (hasDescendantPlus) {
      descendantGen = descendantDigits === '' || descendantDigits === undefined
        ? Infinity
        : parseInt(descendantDigits, 10);
    }

    // Add the node itself
    selected.add(nodeId);

    // Add ancestors if specified
    if (ancestorGen > 0) {
      const ancestors = getAncestors(nodeId, parents, ancestorGen);
      ancestors.forEach(n => selected.add(n));
    }

    // Add descendants if specified
    if (descendantGen > 0) {
      const descendants = getDescendants(nodeId, children, descendantGen);
      descendants.forEach(n => selected.add(n));
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

  // Parse selector and filter nodes (uses DAG nodes/edges for graph traversal)
  const selectedIds = useMemo(
    () => parseSelector(selector, dagNodes, dagEdges),
    [selector, dagNodes, dagEdges]
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
