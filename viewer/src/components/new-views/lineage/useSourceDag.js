import { useMemo } from 'react';
import dagre from 'dagre';
import useStore from '../../../stores/store';

/**
 * Extract source name from source field
 * Handles: ${ref(name)}, ref(name), string name, or object with name property
 */
function extractSourceName(sourceField) {
  if (!sourceField) return null;

  if (typeof sourceField === 'string') {
    // Handle ${ref(source_name)} format (context string - preferred)
    const contextRefMatch = sourceField.match(/^\$\{ref\(([^)]+)\)\}$/);
    if (contextRefMatch) {
      return contextRefMatch[1];
    }

    // Handle ref(source_name) format (legacy)
    const refMatch = sourceField.match(/^ref\(([^)]+)\)$/);
    if (refMatch) {
      return refMatch[1];
    }
    return sourceField;
  }

  if (sourceField.name) {
    return sourceField.name;
  }

  return null;
}

/**
 * Compute layout using dagre (left-to-right)
 */
function computeLayout(nodes, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
  graph.setDefaultEdgeLabel(() => ({}));

  // Add nodes to graph
  nodes.forEach(node => {
    // Estimate node dimensions based on type
    const width = 180;
    const height = 50;
    graph.setNode(node.id, { width, height });
  });

  // Add edges to graph
  edges.forEach(edge => {
    graph.setEdge(edge.source, edge.target);
  });

  // Run dagre layout
  dagre.layout(graph);

  // Apply computed positions to nodes
  return nodes.map(node => {
    const nodeWithPosition = graph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    };
  });
}

/**
 * useSourceDag - Hook for building source-only DAG
 * For backward compatibility, exports as default
 */
export default function useSourceDag() {
  const sources = useStore(state => state.sources);

  const dag = useMemo(() => {
    const nodes = (sources || []).map(source => ({
      id: `source-${source.name}`,
      type: 'sourceNode',
      data: {
        name: source.name,
        type: source.type,
        status: source.status,
        source: source,
        objectType: 'source',
      },
      position: { x: 0, y: 0 }, // Will be set by layout
    }));

    const edges = [];
    const layoutNodes = computeLayout(nodes, edges);

    return { nodes: layoutNodes, edges };
  }, [sources]);

  return dag;
}

/**
 * useLineageDag - Hook for building full DAG with sources and models
 * Uses dagre for automatic left-to-right layout
 */
export function useLineageDag() {
  const sources = useStore(state => state.sources);
  const models = useStore(state => state.models);

  const dag = useMemo(() => {
    const nodes = [];
    const edges = [];

    // Build source nodes
    (sources || []).forEach(source => {
      nodes.push({
        id: `source-${source.name}`,
        type: 'sourceNode',
        data: {
          name: source.name,
          type: source.type,
          status: source.status,
          source: source,
          objectType: 'source',
        },
        position: { x: 0, y: 0 }, // Will be set by layout
      });
    });

    // Build model nodes and edges
    (models || []).forEach(model => {
      nodes.push({
        id: `model-${model.name}`,
        type: 'modelNode',
        data: {
          name: model.name,
          sql: model.sql,
          source: model.source,
          status: model.status,
          model: model,
          objectType: 'model',
        },
        position: { x: 0, y: 0 }, // Will be set by layout
      });

      // Create edge from source to model if source is specified
      const sourceName = extractSourceName(model.source);
      if (sourceName) {
        edges.push({
          id: `edge-${sourceName}-${model.name}`,
          source: `source-${sourceName}`,
          target: `model-${model.name}`,
          // No style = default React Flow edge color (like original lineage)
        });
      }
    });

    // Compute layout with dagre
    const layoutNodes = computeLayout(nodes, edges);

    return { nodes: layoutNodes, edges };
  }, [sources, models]);

  return dag;
}
