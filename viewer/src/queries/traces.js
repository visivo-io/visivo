import { getApiUrl } from '../api/config';

export const fetchTracesQuery = (projectId, names) => ({
  queryKey: ['trace', projectId, names],
  queryFn: async () => {
    return names.map(name => {
      return {
        name: name,
        id: name,
        signed_data_file_url: getApiUrl(`/data/${name}/data.json`),
      };
    });
  },
});
