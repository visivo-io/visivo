import { getApiUrl } from './config';

export const fetchError = async () => {
  const response = await fetch(getApiUrl('/data/error.json'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
