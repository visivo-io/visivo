import md5 from 'md5';
import { getApiUrl } from '../api/config';

export const fetchDashboardQuery = (projectId, name) => ({
  queryKey: ['dashboard', projectId, name],
  queryFn: async () => {
    const hash = md5(name);

    return {
      name: name,
      id: name,
      signed_thumbnail_file_url: getApiUrl(`/data/dashboards/${hash}.png`),
    };
  },
});
