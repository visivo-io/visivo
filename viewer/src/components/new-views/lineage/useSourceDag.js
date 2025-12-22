import { useMemo } from 'react';
import useStore from '../../../stores/store';

/**
 * useSourceDag - Hook for building source-only DAG
 * ONLY reads from sourceStore, independent of namedChildren
 */
export default function useSourceDag() {
  const sources = useStore(state => state.sources);

  const dag = useMemo(() => {
    // Build nodes from sources
    // Sources are root nodes - they have no dependencies on each other
    const nodes = (sources || []).map((source, index) => ({
      id: source.name,
      type: 'sourceNode', // Custom node type
      data: {
        name: source.name,
        type: source.type,
        status: source.status,
        source: source, // Full source data for editing
      },
      // Layout: arrange in a grid pattern
      // 3 columns, spaced horizontally and vertically
      position: {
        x: (index % 3) * 200 + 50,
        y: Math.floor(index / 3) * 100 + 50,
      },
    }));

    // Sources don't have edges to each other (they're all root nodes)
    // In the future when we add models, models will have edges to sources
    const edges = [];

    return { nodes, edges };
  }, [sources]);

  return dag;
}
