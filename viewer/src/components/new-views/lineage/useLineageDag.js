import { useMemo } from 'react';
import dagre from 'dagre';
import useStore from '../../../stores/store';
import { parseRefValue } from '../../../utils/refString';

/**
 * Compute layout using dagre (left-to-right)
 * Exported for use in LineageNew component to recompute layout after filtering
 *
 * @param {Array} nodes - Array of nodes to layout
 * @param {Array} edges - Array of edges
 * @param {Object} fixedNode - Optional { id, position } to keep a node at its current position
 *                              The entire graph will be offset to center around this fixed node
 */
export function computeLayout(nodes, edges, fixedNode = null) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });
  graph.setDefaultEdgeLabel(() => ({}));

  // Add nodes to graph
  nodes.forEach(node => {
    // Estimate node width from name length (~8px per char + padding for icon/status/handles)
    const nameLen = (node.data.name || '').length;
    const width = Math.max(180, nameLen * 8 + 80);
    const height = 50;
    graph.setNode(node.id, { width, height });
  });

  // Add edges to graph
  edges.forEach(edge => {
    graph.setEdge(edge.source, edge.target);
  });

  // Run dagre layout
  dagre.layout(graph);

  // Calculate offset if we have a fixed node
  let offsetX = 0;
  let offsetY = 0;
  if (fixedNode) {
    const fixedNodeLayout = graph.node(fixedNode.id);
    if (fixedNodeLayout) {
      // Calculate where dagre placed the fixed node
      const dagreX = fixedNodeLayout.x - fixedNodeLayout.width / 2;
      const dagreY = fixedNodeLayout.y - fixedNodeLayout.height / 2;

      // Calculate offset to keep fixed node at its original position
      offsetX = fixedNode.position.x - dagreX;
      offsetY = fixedNode.position.y - dagreY;
    }
  }

  // Apply computed positions to nodes (with offset if needed)
  return nodes.map(node => {
    const nodeWithPosition = graph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2 + offsetX,
        y: nodeWithPosition.y - nodeWithPosition.height / 2 + offsetY,
      },
    };
  });
}

/**
 * Generate consistent node ID from type and name
 */
function getNodeId(type, name) {
  return `${type}-${name}`;
}

/**
 * Generate consistent edge ID
 */
function getEdgeId(sourceType, sourceName, targetType, targetName) {
  return `edge-${sourceType}-${sourceName}-to-${targetType}-${targetName}`;
}

/**
 * Extract referenced object names from a dashboard's config rows/items.
 * Items can reference charts, tables, markdowns, selectors, or inputs via ref() strings or inline objects.
 */
function extractDashboardItemRefs(config) {
  const refs = [];
  const rows = config?.rows || [];
  rows.forEach(row => {
    const items = row.items || [];
    items.forEach(item => {
      ['chart', 'table', 'markdown', 'selector', 'input'].forEach(field => {
        const val = item[field];
        if (val) {
          if (typeof val === 'string') {
            refs.push(parseRefValue(val));
          } else if (typeof val === 'object' && val.name) {
            refs.push(val.name);
          }
        }
      });
    });
  });
  return refs;
}

/**
 * useLineageDag - Hook for building full DAG with sources, models, dimensions, metrics, relations, insights, and dashboards
 * Uses dagre for automatic left-to-right layout
 * Uses child_item_names from backend for relationships
 */
export function useLineageDag() {
  const sources = useStore(state => state.sources);
  const models = useStore(state => state.models);
  const dimensions = useStore(state => state.dimensions);
  const metrics = useStore(state => state.metrics);
  const relations = useStore(state => state.relations);
  const insights = useStore(state => state.insights);
  const markdowns = useStore(state => state.markdowns);
  const charts = useStore(state => state.charts);
  const tables = useStore(state => state.tables);
  const dashboards = useStore(state => state.dashboards);
  const defaults = useStore(state => state.defaults);
  const inputs = useStore(state => state.inputs);
  const csvScriptModels = useStore(state => state.csvScriptModels);
  const localMergeModels = useStore(state => state.localMergeModels);

  const dag = useMemo(() => {
    const nodes = [];
    const edges = [];

    // Build a lookup map of object names to their types for edge creation
    const objectTypeByName = {};
    (sources || []).forEach(s => { objectTypeByName[s.name] = 'source'; });
    (models || []).forEach(m => { objectTypeByName[m.name] = 'model'; });
    (dimensions || []).forEach(d => { objectTypeByName[d.name] = 'dimension'; });
    (metrics || []).forEach(m => { objectTypeByName[m.name] = 'metric'; });
    (relations || []).forEach(r => { objectTypeByName[r.name] = 'relation'; });
    (insights || []).forEach(i => { objectTypeByName[i.name] = 'insight'; });
    (markdowns || []).forEach(m => { objectTypeByName[m.name] = 'markdown'; });
    (charts || []).forEach(c => { objectTypeByName[c.name] = 'chart'; });
    (tables || []).forEach(t => { objectTypeByName[t.name] = 'table'; });
    (dashboards || []).forEach(d => { objectTypeByName[d.name] = 'dashboard'; });
    (inputs || []).forEach(i => { objectTypeByName[i.name] = 'input'; });
    (csvScriptModels || []).forEach(m => { objectTypeByName[m.name] = 'csvScriptModel'; });
    (localMergeModels || []).forEach(m => { objectTypeByName[m.name] = 'localMergeModel'; });

    /**
     * Add a node to the DAG
     */
    const addNode = (name, type, nodeType, data) => {
      nodes.push({
        id: getNodeId(type, name),
        type: nodeType,
        data: {
          name,
          objectType: type,
          ...data,
        },
        position: { x: 0, y: 0 }, // Will be set by layout
      });
    };

    /**
     * Add an edge to the DAG
     */
    const addEdge = (sourceName, sourceType, targetName, targetType) => {
      edges.push({
        id: getEdgeId(sourceType, sourceName, targetType, targetName),
        source: getNodeId(sourceType, sourceName),
        target: getNodeId(targetType, targetName),
      });
    };

    // Build source nodes
    (sources || []).forEach(source => {
      addNode(source.name, 'source', 'sourceNode', {
        type: source.config?.type,
        status: source.status,
        source: source,
      });
    });

    // Build model nodes and edges
    (models || []).forEach(model => {
      addNode(model.name, 'model', 'modelNode', {
        sql: model.config?.sql,
        source: model.config?.source,
        status: model.status,
        model: model,
      });

      const childNames = [...new Set(model.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, model.name, 'model');
        }
      });
    });

    // Build csvScriptModel nodes
    (csvScriptModels || []).forEach(model => {
      addNode(model.name, 'csvScriptModel', 'csvScriptModelNode', {
        status: model.status,
        model: model,
      });

      const childNames = [...new Set(model.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, model.name, 'csvScriptModel');
        }
      });
    });

    // Build localMergeModel nodes
    (localMergeModels || []).forEach(model => {
      addNode(model.name, 'localMergeModel', 'localMergeModelNode', {
        sql: model.config?.sql,
        status: model.status,
        model: model,
      });

      const childNames = [...new Set(model.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, model.name, 'localMergeModel');
        }
      });
    });

    // Default source inference: models without explicit sources get dashed edge to default source
    const defaultSourceName = defaults?.source_name;
    if (defaultSourceName && objectTypeByName[defaultSourceName] === 'source') {
      (models || []).forEach(model => {
        const childNames = model.child_item_names || [];
        if (childNames.length === 0) {
          edges.push({
            id: getEdgeId('source', defaultSourceName, 'model', model.name),
            source: getNodeId('source', defaultSourceName),
            target: getNodeId('model', model.name),
            style: { strokeDasharray: '5 5' },
            data: { isImplicit: true },
          });
        }
      });
    }

    // Build dimension nodes and edges to parent models
    (dimensions || []).forEach(dimension => {
      addNode(dimension.name, 'dimension', 'dimensionNode', {
        sql: dimension.config?.sql,
        status: dimension.status,
        dimension: dimension,
      });

      const childNames = [...new Set(dimension.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, dimension.name, 'dimension');
        }
      });
    });

    // Build metric nodes and edges to parent models
    (metrics || []).forEach(metric => {
      addNode(metric.name, 'metric', 'metricNode', {
        sql: metric.config?.sql,
        status: metric.status,
        metric: metric,
      });

      const childNames = [...new Set(metric.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, metric.name, 'metric');
        }
      });
    });

    // Build relation nodes and edges to parent models
    (relations || []).forEach(relation => {
      addNode(relation.name, 'relation', 'relationNode', {
        model: relation.config?.model,
        sql_on: relation.config?.sql_on,
        status: relation.status,
        relation: relation,
      });

      const childNames = [...new Set(relation.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, relation.name, 'relation');
        }
      });
    });

    // Build insight nodes and edges to dependencies (models, metrics, dimensions, etc.)
    (insights || []).forEach(insight => {
      addNode(insight.name, 'insight', 'insightNode', {
        propsType: insight.config?.props?.type,
        status: insight.status,
        insight: insight,
      });

      // Create edges from insight's child_item_names (can be models, metrics, dimensions, etc.)
      const childNames = [...new Set(insight.child_item_names || [])];
      childNames.forEach(childName => {
        // Look up the type of the child object to create the correct edge source
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, insight.name, 'insight');
        }
      });
    });

    // Build markdown nodes (no edges - markdowns are standalone)
    (markdowns || []).forEach(markdown => {
      addNode(markdown.name, 'markdown', 'markdownNode', {
        status: markdown.status,
        markdown: markdown,
      });
    });

    // Build input nodes (standalone, like markdowns - connected to dashboards via dashboard items)
    (inputs || []).forEach(input => {
      addNode(input.name, 'input', 'inputNode', {
        status: input.status,
        input: input,
      });
    });

    // Build chart nodes and edges from child items (primarily insights)
    (charts || []).forEach(chart => {
      addNode(chart.name, 'chart', 'chartNode', {
        status: chart.status,
        chart: chart,
      });

      const childNames = [...new Set(chart.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, chart.name, 'chart');
        }
      });
    });

    // Build table nodes and edges from child items (primarily insights)
    (tables || []).forEach(table => {
      addNode(table.name, 'table', 'tableNode', {
        status: table.status,
        table: table,
      });

      const childNames = [...new Set(table.child_item_names || [])];
      childNames.forEach(childName => {
        const childType = objectTypeByName[childName];
        if (childType) {
          addEdge(childName, childType, table.name, 'table');
        }
      });
    });

    // Build dashboard nodes and edges from their items (charts, tables, markdowns, selectors)
    (dashboards || []).forEach(dashboard => {
      addNode(dashboard.name, 'dashboard', 'dashboardNode', {
        status: dashboard.status,
        dashboard: dashboard,
      });

      // Parse dashboard config to extract referenced items
      const itemRefs = extractDashboardItemRefs(dashboard.config);
      // Deduplicate refs (same item may be referenced multiple times in different rows)
      const uniqueRefs = [...new Set(itemRefs)];
      uniqueRefs.forEach(refName => {
        const childType = objectTypeByName[refName];
        if (childType) {
          addEdge(refName, childType, dashboard.name, 'dashboard');
        }
      });
    });

    // Filter out any edges whose source or target node doesn't exist
    const nodeIds = new Set(nodes.map(n => n.id));
    const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    // Compute layout with dagre
    const layoutNodes = computeLayout(nodes, validEdges);

    return { nodes: layoutNodes, edges: validEdges };
  }, [sources, models, dimensions, metrics, relations, insights, markdowns, charts, tables, dashboards, inputs, defaults, csvScriptModels, localMergeModels]);

  return dag;
}

export default useLineageDag;
