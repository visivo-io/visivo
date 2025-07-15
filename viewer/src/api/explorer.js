import { getUrl } from '../config/urls';

export const fetchExplorer = async () => {
  const response = await fetch(getUrl('explorer'));
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error('Failed to fetch explorer data');
    return null;
  }
};
