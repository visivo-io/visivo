import { getUrl } from '../contexts/URLContext';

export const fetchProject = async () => {
  const response = await fetch(getUrl('project'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
