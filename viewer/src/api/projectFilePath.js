import { getApiUrl } from './config';

export const fetchProjectFilePath = async () => {
  const response = await fetch(getApiUrl('/api/project/project_file_path'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
