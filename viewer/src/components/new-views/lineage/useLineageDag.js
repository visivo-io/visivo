import { useMemo } from 'react';
import dagre from 'dagre';
import useStore from '../../../stores/store';

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
 * useLineageDag - Hook for building full DAG with sources and models
 * Uses dagre for automatic left-to-right layout
 * Uses child_item_names from backend for relationships
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

      // Create edges from model's child_item_names (sources it depends on)
      const childNames = model.child_item_names || [];
      childNames.forEach(childName => {
        edges.push({
          id: `edge-${childName}-${model.name}`,
          source: `source-${childName}`,
          target: `model-${model.name}`,
        });
      });
    });

    // Compute layout with dagre
    const layoutNodes = computeLayout(nodes, edges);

    return { nodes: layoutNodes, edges };
  }, [sources, models]);

  return dag;
}

export default useLineageDag;
