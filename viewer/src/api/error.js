import { getUrl } from '../config/urls';

export const fetchError = async () => {
  const response = await fetch(getUrl('error'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
