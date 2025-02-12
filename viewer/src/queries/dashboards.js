export const fetchDashboardQuery = (projectId, name) => ({
    queryKey: ['dashboard', projectId, name],
    queryFn: async () => {
        const hash = require('md5')(name);

        return {
            "name": name,
            "id": name,
            "signed_thumbnail_file_url": `/data/dashboards/${hash}.png`,
        }
    }
})
