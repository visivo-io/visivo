import { getApiUrl } from './config';

export const fetchProject = async () => {
  const response = await fetch(getApiUrl('/data/project.json'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
