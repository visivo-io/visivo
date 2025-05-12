import { useMemo } from 'react';
import useStore from '../stores/store';
import { buildGraph } from '../components/lineage/graphUtils';
export default function useDag() {
  const namedChildren = useStore(state => state.namedChildren);

  const dag = useMemo(() => {
    return buildGraph(namedChildren);
  }, [namedChildren]);

  return dag;
}
