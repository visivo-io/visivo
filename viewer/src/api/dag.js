import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

export const fetchDag = async () => {
  const response = await apiFetch(getUrl('dag'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
