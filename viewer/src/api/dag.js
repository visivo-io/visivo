import { getUrl } from '../contexts/URLContext';

export const fetchDag = async () => {
  const response = await fetch(getUrl('dag'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
