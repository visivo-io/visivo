export const fetchDashboardsQuery = (projectId, names) => ({
    queryKey: ['dashboards', projectId, names],
    queryFn: async () => {
        return names.map((name) => {
            const hash = require('md5')(name);

            return {
                "name": name,
                "id": name,
                "signed_thumbnail_file_url": `/data/dashboards/${hash}.png`,
            }
        })
    }
})
