import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

export const fetchError = async () => {
  const response = await apiFetch(getUrl('error'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
