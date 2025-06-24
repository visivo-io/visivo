export const fetchDashboardQuery = (projectId, name) => ({
  queryKey: ['dashboard', projectId, name],
  queryFn: async () => {
    return (await fetch(`/data/dashboards/${name}`)).json();
  },
});
