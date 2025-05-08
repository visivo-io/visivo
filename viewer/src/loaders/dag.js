import { throwError } from '../api/utils';
import { fetchDag } from '../api/dag';

export const loadDag = async () => {
  const dag = await fetchDag();
  if (dag) {
    return dag;
  } else {
    throwError('Dag not found.', 404);
  }
};
