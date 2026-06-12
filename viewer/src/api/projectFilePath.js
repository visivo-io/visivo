import { getUrl } from '../contexts/URLContext';
import { apiFetch } from './utils';

export const fetchProjectFilePath = async () => {
  const response = await apiFetch(getUrl('projectFilePath'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
