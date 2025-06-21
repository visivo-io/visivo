import { getApiUrl } from './config';

export const fetchSchema = async () => {
  const response = await fetch(getApiUrl('/data/schema.json'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
