import { useMemo } from 'react';
import useStore from '../../../stores/store';

/**
 * Extract source name from source field
 * Handles: ref(name), string name, or object with name property
 */
function extractSourceName(sourceField) {
  if (!sourceField) return null;

  if (typeof sourceField === 'string') {
    // Handle ref(source_name) format
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
 * useSourceDag - Hook for building source-only DAG
 * For backward compatibility, exports as default
 */
export default function useSourceDag() {
  const sources = useStore(state => state.sources);

  const dag = useMemo(() => {
    const nodes = (sources || []).map((source, index) => ({
      id: `source-${source.name}`,
      type: 'sourceNode',
      data: {
        name: source.name,
        type: source.type,
        status: source.status,
        source: source,
        objectType: 'source',
      },
      position: {
        x: (index % 3) * 200 + 50,
        y: Math.floor(index / 3) * 100 + 50,
      },
    }));

    const edges = [];

    return { nodes, edges };
  }, [sources]);

  return dag;
}

/**
 * useLineageDag - Hook for building full DAG with sources and models
 * Models are positioned to the right of sources and have edges to their source
 */
export function useLineageDag() {
  const sources = useStore(state => state.sources);
  const models = useStore(state => state.models);

  const dag = useMemo(() => {
    const nodes = [];
    const edges = [];

    // Build source nodes (positioned on the left)
    (sources || []).forEach((source, index) => {
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
        position: {
          x: 50,
          y: index * 80 + 50,
        },
      });
    });

    // Build model nodes (positioned on the right)
    (models || []).forEach((model, index) => {
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
        position: {
          x: 350,
          y: index * 80 + 50,
        },
      });

      // Create edge from source to model if source is specified
      const sourceName = extractSourceName(model.source);
      if (sourceName) {
        edges.push({
          id: `edge-${sourceName}-${model.name}`,
          source: `source-${sourceName}`,
          target: `model-${model.name}`,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        });
      }
    });

    return { nodes, edges };
  }, [sources, models]);

  return dag;
}
