import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import useStore from '../../../stores/store';
import { useLineageDag } from './useLineageDag';
import { useObjectSave } from '../../../hooks/useObjectSave';
import SourceNode from './SourceNode';
import ModelNode from './ModelNode';
import DimensionNode from './DimensionNode';
import MetricNode from './MetricNode';
import RelationNode from './RelationNode';
import InsightNode from './InsightNode';
import MarkdownNode from './MarkdownNode';
import ChartNode from './ChartNode';
import TableNode from './TableNode';
import DashboardNode from './DashboardNode';
import CsvScriptModelNode from './CsvScriptModelNode';
import LocalMergeModelNode from './LocalMergeModelNode';
import InputNode from './InputNode';
import EditPanel from '../common/EditPanel';
import CreateButton from '../common/CreateButton';
import { Button } from '../../styled/Button';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { createEmbeddedEditHandler } from '../common/embeddedObjectConfig';
import { formatRefExpression } from '../../../utils/refString';

/**
 * LineageNew - Lineage view for sources, models, dimensions, metrics, relations, and insights
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

  // Dimensions
  const fetchDimensions = useStore(state => state.fetchDimensions);
  const dimensionsLoading = useStore(state => state.dimensionsLoading);

  // Metrics
  const fetchMetrics = useStore(state => state.fetchMetrics);
  const metricsLoading = useStore(state => state.metricsLoading);

  // Relations
  const fetchRelations = useStore(state => state.fetchRelations);
  const relationsLoading = useStore(state => state.relationsLoading);

  // Insights
  const fetchInsights = useStore(state => state.fetchInsights);
  const insightsLoading = useStore(state => state.insightsLoading);

  // Markdowns
  const fetchMarkdowns = useStore(state => state.fetchMarkdowns);
  const markdownsLoading = useStore(state => state.markdownsLoading);

  // Charts
  const fetchCharts = useStore(state => state.fetchCharts);
  const chartsLoading = useStore(state => state.chartsLoading);

  // Tables
  const fetchTables = useStore(state => state.fetchTables);
  const tablesLoading = useStore(state => state.tablesLoading);

  // Dashboards
  const fetchDashboards = useStore(state => state.fetchDashboards);
  const dashboardsLoading = useStore(state => state.dashboardsLoading);

  // CsvScriptModels
  const fetchCsvScriptModels = useStore(state => state.fetchCsvScriptModels);
  const csvScriptModelsLoading = useStore(state => state.csvScriptModelsLoading);

  // LocalMergeModels
  const fetchLocalMergeModels = useStore(state => state.fetchLocalMergeModels);
  const localMergeModelsLoading = useStore(state => state.localMergeModelsLoading);

  // Inputs
  const fetchInputs = useStore(state => state.fetchInputs);
  const inputsLoading = useStore(state => state.inputsLoading);

  // Defaults
  const fetchDefaults = useStore(state => state.fetchDefaults);

  // Navigation stack for editing - supports drilling into embedded objects
  // Each item is { type: 'source'|'model'|etc, object: {...}, applyToParent?: fn }
  // applyToParent is provided by parent forms for embedded objects
  const [editStack, setEditStack] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createObjectType, setCreateObjectType] = useState('source');
  const [selector, setSelector] = useState('');

  // Navigation stack helpers
  // options.applyToParent: (parentConfig, embeddedConfig) => newParentConfig
  const pushEdit = useCallback((type, object, options = {}) => {
    setEditStack(prev => [...prev, { type, object, ...options }]);
    setIsCreating(false);
  }, []);

  const popEdit = useCallback(() => {
    setEditStack(prev => prev.slice(0, -1));
  }, []);

  const clearEdit = useCallback(() => {
    setEditStack([]);
  }, []);

  const currentEdit = editStack.length > 0 ? editStack[editStack.length - 1] : null;
  const canGoBack = editStack.length > 1;

  const reactFlowInstance = useRef(null);
  const hasFitView = useRef(false);

  // Note: Individual save functions are now handled by useObjectSave hook

  // Fetch all object types on mount
  useEffect(() => {
    fetchSources();
    fetchModels();
    fetchDimensions();
    fetchMetrics();
    fetchRelations();
    fetchInsights();
    fetchMarkdowns();
    fetchCharts();
    fetchTables();
    fetchDashboards();
    fetchCsvScriptModels();
    fetchLocalMergeModels();
    fetchInputs();
    fetchDefaults();
  }, [fetchSources, fetchModels, fetchDimensions, fetchMetrics, fetchRelations, fetchInsights, fetchMarkdowns, fetchCharts, fetchTables, fetchDashboards, fetchCsvScriptModels, fetchLocalMergeModels, fetchInputs, fetchDefaults]);

  // Get DAG data
  const { nodes: dagNodes, edges: dagEdges } = useLineageDag();

  // Parse selector string into matching node IDs
  const parseSelector = useCallback((selectorStr, nodes, edges) => {
    if (!selectorStr.trim()) {
      return new Set(nodes.map(n => n.id));
    }

    // Build adjacency lists for graph traversal
    const buildAdjacencyLists = () => {
      const children = {};
      const parents = {};
      nodes.forEach(n => {
        children[n.id] = [];
        parents[n.id] = [];
      });
      edges.forEach(e => {
        if (children[e.source]) children[e.source].push(e.target);
        if (parents[e.target]) parents[e.target].push(e.source);
      });
      return { children, parents };
    };

    const { children, parents } = buildAdjacencyLists();

    // Get all descendants of a node
    const getDescendants = nodeId => {
      const result = new Set();
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift();
        (children[current] || []).forEach(child => {
          if (!result.has(child)) {
            result.add(child);
            queue.push(child);
          }
        });
      }
      return result;
    };

    // Get all ancestors of a node
    const getAncestors = nodeId => {
      const result = new Set();
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift();
        (parents[current] || []).forEach(parent => {
          if (!result.has(parent)) {
            result.add(parent);
            queue.push(parent);
          }
        });
      }
      return result;
    };

    const selected = new Set();
    const parts = selectorStr
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);

    parts.forEach(part => {
      // Check for +name+ pattern (ancestors and descendants)
      const plusMatch = part.match(/^\+(.+)\+$/);
      if (plusMatch) {
        const name = plusMatch[1];
        nodes.forEach(n => {
          if (n.data.name === name || n.id === name || n.id.endsWith(`-${name}`)) {
            selected.add(n.id);
            getDescendants(n.id).forEach(d => selected.add(d));
            getAncestors(n.id).forEach(a => selected.add(a));
          }
        });
        return;
      }

      // Check for name+ pattern (node and descendants)
      const suffixMatch = part.match(/^(.+)\+$/);
      if (suffixMatch) {
        const name = suffixMatch[1];
        nodes.forEach(n => {
          if (n.data.name === name || n.id === name || n.id.endsWith(`-${name}`)) {
            selected.add(n.id);
            getDescendants(n.id).forEach(d => selected.add(d));
          }
        });
        return;
      }

      // Check for +name pattern (node and ancestors)
      const prefixMatch = part.match(/^\+(.+)$/);
      if (prefixMatch) {
        const name = prefixMatch[1];
        nodes.forEach(n => {
          if (n.data.name === name || n.id === name || n.id.endsWith(`-${name}`)) {
            selected.add(n.id);
            getAncestors(n.id).forEach(a => selected.add(a));
          }
        });
        return;
      }

      // Plain name - just select matching nodes
      nodes.forEach(n => {
        if (n.data.name === part || n.id === part || n.id === `source-${part}` || n.id === `model-${part}` || n.id === `dimension-${part}` || n.id === `metric-${part}` || n.id === `relation-${part}` || n.id === `insight-${part}` || n.id === `markdown-${part}` || n.id === `chart-${part}` || n.id === `table-${part}`) {
          selected.add(n.id);
        }
      });
    });

    return selected;
  }, []);

  // Compute which nodes to show based on selector
  const selectedIds = useMemo(
    () => parseSelector(selector, dagNodes, dagEdges),
    [selector, dagNodes, dagEdges, parseSelector]
  );

  // Filter and add onEdit handler + isEditing state to each node's data
  const nodes = useMemo(() => {
    return dagNodes
      .filter(node => selectedIds.has(node.id))
      .map(node => {
        // Determine if this node is currently being edited (check the top of the stack)
        const objectType = node.data.objectType;
        const nodeName = node.data.name;
        const isEditing = currentEdit?.type === objectType && currentEdit?.object?.name === nodeName;

        return {
          ...node,
          data: {
            ...node.data,
            isEditing,
            onEdit: obj => {
              // Clear stack and push this as the new root edit
              clearEdit();
              pushEdit(objectType, obj);
            },
            // Generic handlers for embedded objects based on configuration
            onEditEmbeddedSource: createEmbeddedEditHandler(clearEdit, pushEdit, objectType, node.data, 'source'),
            onEditEmbeddedInsight: createEmbeddedEditHandler(clearEdit, pushEdit, objectType, node.data, 'insight'),
          },
        };
      });
  }, [dagNodes, selectedIds, currentEdit, clearEdit, pushEdit]);

  // Filter edges to only show edges between visible nodes
  const edges = useMemo(() => {
    return dagEdges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target));
  }, [dagEdges, selectedIds]);

  // Fit view when nodes are first loaded
  useEffect(() => {
    if (nodes.length > 0 && reactFlowInstance.current && !hasFitView.current) {
      // Small delay to ensure nodes are rendered
      setTimeout(() => {
        reactFlowInstance.current.fitView({ padding: 0.2 });
        hasFitView.current = true;
      }, 100);
    }
  }, [nodes.length]);

  // Node types for React Flow
  const nodeTypes = useMemo(
    () => ({
      sourceNode: SourceNode,
      modelNode: ModelNode,
      dimensionNode: DimensionNode,
      metricNode: MetricNode,
      relationNode: RelationNode,
      insightNode: InsightNode,
      markdownNode: MarkdownNode,
      chartNode: ChartNode,
      tableNode: TableNode,
      dashboardNode: DashboardNode,
      csvScriptModelNode: CsvScriptModelNode,
      localMergeModelNode: LocalMergeModelNode,
      inputNode: InputNode,
    }),
    []
  );

  // Handle node click - open edit panel for the clicked node
  const handleNodeClick = useCallback((event, node) => {
    const objectType = node.data.objectType;
    const objectData = node.data[objectType]; // e.g., node.data.model, node.data.source, etc.
    clearEdit();
    pushEdit(objectType, objectData);
  }, [clearEdit, pushEdit]);

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
          source: formatRefExpression(sourceName),
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

  // Handle create button selection
  const handleCreateSelect = useCallback(objectType => {
    clearEdit();
    setIsCreating(true);
    setCreateObjectType(objectType);
  }, [clearEdit]);

  // Handle panel close
  const handlePanelClose = useCallback(() => {
    clearEdit();
    setIsCreating(false);
  }, [clearEdit]);

  // Refresh all data after save
  const refreshData = useCallback(async () => {
    await fetchSources();
    await fetchModels();
    await fetchDimensions();
    await fetchMetrics();
    await fetchRelations();
    await fetchInsights();
    await fetchMarkdowns();
    await fetchCharts();
    await fetchTables();
    await fetchDashboards();
    await fetchCsvScriptModels();
    await fetchLocalMergeModels();
    await fetchInputs();
    await fetchDefaults();
  }, [fetchSources, fetchModels, fetchDimensions, fetchMetrics, fetchRelations, fetchInsights, fetchMarkdowns, fetchCharts, fetchTables, fetchDashboards, fetchCsvScriptModels, fetchLocalMergeModels, fetchInputs, fetchDefaults]);

  // Create success callback for the save handler
  const onSuccessfulSave = useCallback(async () => {
    await refreshData();
    clearEdit();
    setIsCreating(false);
  }, [refreshData, clearEdit]);

  // Use unified save handler from custom hook
  const handleObjectSave = useObjectSave(currentEdit, setEditStack, onSuccessfulSave);

  const isPanelOpen = editStack.length > 0 || isCreating;
  const isLoading = sourcesLoading || modelsLoading || dimensionsLoading || metricsLoading || relationsLoading || insightsLoading || markdownsLoading || chartsLoading || tablesLoading || dashboardsLoading || csvScriptModelsLoading || localMergeModelsLoading || inputsLoading;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Selector input bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
        <Button variant="secondary" size="sm" onClick={() => setSelector('')} disabled={!selector}>
          Clear
        </Button>
        <input
          type="text"
          value={selector}
          onChange={e => setSelector(e.target.value)}
          placeholder="e.g., 'source_name', 'model_name', or '+name+'"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* DAG area */}
        <div
          className={`flex-1 relative ${isPanelOpen ? 'mr-96' : ''} transition-all duration-200`}
        >
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
              <div className="text-gray-400 text-sm">Try a different selector or click Clear</div>
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
                // Get color from object type config
                const typeConfig = getTypeByValue(objectType);
                return typeConfig?.colors?.connectionHandle || '#94a3b8'; // gray fallback
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
              editItem={currentEdit}
              canGoBack={canGoBack}
              onGoBack={popEdit}
              onNavigateTo={pushEdit}
              objectType={createObjectType}
              isCreate={isCreating}
              onClose={handlePanelClose}
              onSave={handleObjectSave}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LineageNew;
