import { getUrl } from '../contexts/URLContext';

export const fetchProjectFilePath = async () => {
  const response = await fetch(getUrl('projectFilePath'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
