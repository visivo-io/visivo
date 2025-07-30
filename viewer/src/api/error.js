import { getUrl } from '../contexts/URLContext';

export const fetchError = async () => {
  const response = await fetch(getUrl('error'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
