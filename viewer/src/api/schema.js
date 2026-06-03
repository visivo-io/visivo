import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

export const fetchSchema = async () => {
  const response = await apiFetch(getUrl('schema'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
