import { useMemo } from 'react';
import useStore from '../stores/store';
import dagre from 'dagre';

export default function useDag() {
  const namedChildren = useStore(state => state.namedChildren);

  const dag = useMemo(() => {
    const dag = new dagre.graphlib.Graph();
    for (const [name, children] of Object.entries(namedChildren)) {
      dag.setNode(name, { width: 100, height: 100 });
      for (const child of children) {
        dag.setEdge(name, child);
      }
    }
    dag.setDefaultEdgeLabel(function () {
      return {};
    });
    return dag;
  }, [namedChildren]);

  return dag;
}
