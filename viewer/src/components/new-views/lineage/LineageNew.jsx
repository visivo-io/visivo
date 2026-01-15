import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import useStore from '../../../stores/store';
import { useLineageDag } from './useLineageDag';
import SourceNode from './SourceNode';
import ModelNode from './ModelNode';
import DimensionNode from './DimensionNode';
import MetricNode from './MetricNode';
import RelationNode from './RelationNode';
import InsightNode from './InsightNode';
import MarkdownNode from './MarkdownNode';
import ChartNode from './ChartNode';
import TableNode from './TableNode';
import EditPanel from '../common/EditPanel';
import CreateButton from '../common/CreateButton';
import { Button } from '../../styled/Button';
import { isEmbeddedObject, setAtPath } from '../common/embeddedObjectUtils';

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
  const fetchInsightConfigs = useStore(state => state.fetchInsightConfigs);
  const insightConfigsLoading = useStore(state => state.insightConfigsLoading);

  // Markdowns
  const fetchMarkdownConfigs = useStore(state => state.fetchMarkdownConfigs);
  const markdownConfigsLoading = useStore(state => state.markdownConfigsLoading);

  // Charts
  const fetchChartConfigs = useStore(state => state.fetchChartConfigs);
  const chartConfigsLoading = useStore(state => state.chartConfigsLoading);

  // Tables
  const fetchTableConfigs = useStore(state => state.fetchTableConfigs);
  const tableConfigsLoading = useStore(state => state.tableConfigsLoading);

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

  // Charts and tables stores
  const saveChartConfig = useStore(state => state.saveChartConfig);
  const saveTableConfig = useStore(state => state.saveTableConfig);

  // Additional store functions for unified save
  const saveSource = useStore(state => state.saveSource);
  const saveDimension = useStore(state => state.saveDimension);
  const saveMetric = useStore(state => state.saveMetric);
  const saveRelation = useStore(state => state.saveRelation);
  const saveInsightConfig = useStore(state => state.saveInsightConfig);
  const saveMarkdownConfig = useStore(state => state.saveMarkdownConfig);

  // Fetch all object types on mount
  useEffect(() => {
    fetchSources();
    fetchModels();
    fetchDimensions();
    fetchMetrics();
    fetchRelations();
    fetchInsightConfigs();
    fetchMarkdownConfigs();
    fetchChartConfigs();
    fetchTableConfigs();
  }, [fetchSources, fetchModels, fetchDimensions, fetchMetrics, fetchRelations, fetchInsightConfigs, fetchMarkdownConfigs, fetchChartConfigs, fetchTableConfigs]);

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
          if (n.data.name === name || n.id === name || n.id === `source-${name}` || n.id === `model-${name}` || n.id === `dimension-${name}` || n.id === `metric-${name}` || n.id === `relation-${name}` || n.id === `insight-${name}` || n.id === `markdown-${name}` || n.id === `chart-${name}` || n.id === `table-${name}`) {
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
          if (n.data.name === name || n.id === name || n.id === `source-${name}` || n.id === `model-${name}` || n.id === `dimension-${name}` || n.id === `metric-${name}` || n.id === `relation-${name}` || n.id === `insight-${name}` || n.id === `markdown-${name}` || n.id === `chart-${name}` || n.id === `table-${name}`) {
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
          if (n.data.name === name || n.id === name || n.id === `source-${name}` || n.id === `model-${name}` || n.id === `dimension-${name}` || n.id === `metric-${name}` || n.id === `relation-${name}` || n.id === `insight-${name}` || n.id === `markdown-${name}` || n.id === `chart-${name}` || n.id === `table-${name}`) {
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
            // For models with embedded sources, clicking the nested source pill opens the source editor
            onEditEmbeddedSource: objectType === 'model' ? () => {
              const embeddedSourceConfig = node.data.source;
              // Create a synthetic source object with embedded marker
              const syntheticSource = {
                name: `(embedded in ${node.data.name})`,
                config: embeddedSourceConfig,
                _embedded: { parentType: 'model', parentName: node.data.name, path: 'source' },
              };
              // Clear stack and push model first, then embedded source with applyToParent
              clearEdit();
              pushEdit('model', node.data.model);
              pushEdit('source', syntheticSource, {
                applyToParent: (parentConfig, newSourceConfig) => ({
                  ...parentConfig,
                  source: newSourceConfig,
                }),
              });
            } : undefined,
            // For charts/tables with embedded insights, clicking opens the insight editor
            onEditEmbeddedInsight: (objectType === 'chart' || objectType === 'table') ? (insightConfig, index) => {
              const parentName = objectType === 'chart' ? node.data.chart?.name : node.data.table?.name;
              const parentObj = objectType === 'chart' ? node.data.chart : node.data.table;
              // Create a synthetic insight with embedded marker
              const syntheticInsight = {
                name: `(embedded insight ${index + 1} in ${parentName})`,
                config: insightConfig,
                _embedded: { parentType: objectType, parentName, path: `insights[${index}]` },
              };
              // Clear stack and push parent first, then embedded insight with applyToParent
              clearEdit();
              pushEdit(objectType, parentObj);
              pushEdit('insight', syntheticInsight, {
                applyToParent: (parentConfig, newInsightConfig) =>
                  setAtPath(parentConfig, `insights[${index}]`, newInsightConfig),
              });
            } : undefined,
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
    await fetchInsightConfigs();
    await fetchMarkdownConfigs();
    await fetchChartConfigs();
    await fetchTableConfigs();
  }, [fetchSources, fetchModels, fetchDimensions, fetchMetrics, fetchRelations, fetchInsightConfigs, fetchMarkdownConfigs, fetchChartConfigs, fetchTableConfigs]);

  // Unified save handler - handles both standalone and embedded objects
  const handleObjectSave = useCallback(async (type, name, config) => {
    const stackEntry = currentEdit;
    const currentObject = stackEntry?.object;
    const isEmbedded = isEmbeddedObject(currentObject);

    // For embedded objects with applyToParent, update the parent's config in the stack
    // No backend save - that happens when the parent form saves
    if (isEmbedded && stackEntry?.applyToParent) {
      setEditStack(prev => {
        const newStack = [...prev];
        const parentIndex = newStack.length - 2;
        if (parentIndex >= 0) {
          const parentEntry = newStack[parentIndex];
          const updatedParentConfig = stackEntry.applyToParent(parentEntry.object.config, config);
          newStack[parentIndex] = {
            ...parentEntry,
            object: {
              ...parentEntry.object,
              config: updatedParentConfig,
            },
          };
        }
        // Pop the current entry
        return newStack.slice(0, -1);
      });
      return { success: true };
    }

    // Standalone save - save directly to backend
    let result;
    switch (type) {
      case 'source':
        result = await saveSource(name, config);
        break;
      case 'model':
        result = await saveModel(name, config);
        break;
      case 'dimension':
        result = await saveDimension(name, config);
        break;
      case 'metric':
        result = await saveMetric(name, config);
        break;
      case 'relation':
        result = await saveRelation(name, config);
        break;
      case 'insight':
        result = await saveInsightConfig(name, config);
        break;
      case 'markdown':
        result = await saveMarkdownConfig(name, config);
        break;
      case 'chart':
        result = await saveChartConfig(name, config);
        break;
      case 'table':
        result = await saveTableConfig(name, config);
        break;
      default:
        result = { success: false, error: `Unknown object type: ${type}` };
    }

    if (result?.success) {
      await refreshData();
      clearEdit();
      setIsCreating(false);
    }

    return result;
  }, [currentEdit, saveSource, saveModel, saveDimension, saveMetric, saveRelation, saveInsightConfig, saveMarkdownConfig, saveChartConfig, saveTableConfig, refreshData, clearEdit]);

  const isPanelOpen = editStack.length > 0 || isCreating;
  const isLoading = sourcesLoading || modelsLoading || dimensionsLoading || metricsLoading || relationsLoading || insightConfigsLoading || markdownConfigsLoading || chartConfigsLoading || tableConfigsLoading;

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
                // Different base color for different object types
                switch (objectType) {
                  case 'source':
                    return '#14b8a6'; // teal
                  case 'model':
                    return '#6366f1'; // indigo
                  case 'dimension':
                    return '#a855f7'; // purple
                  case 'metric':
                    return '#f97316'; // orange
                  case 'relation':
                    return '#06b6d4'; // cyan
                  case 'insight':
                    return '#ec4899'; // pink
                  case 'markdown':
                    return '#22c55e'; // green
                  case 'chart':
                    return '#3b82f6'; // blue
                  case 'table':
                    return '#f59e0b'; // amber
                  default:
                    return '#94a3b8'; // gray
                }
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
