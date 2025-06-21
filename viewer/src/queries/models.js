export const fetchModelsQuery = (projectId, names) => ({
  queryKey: ['model', projectId, names],
  queryFn: async () => {
    return names.map(name => {
      return {
        name: name,
        id: name,
        signed_data_file_url: `/data/${name}/data.json`,
      };
    });
  },
});
