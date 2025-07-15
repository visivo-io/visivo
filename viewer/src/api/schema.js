import { getUrl } from '../config/urls';

export const fetchSchema = async () => {
  const response = await fetch(getUrl('schema'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
