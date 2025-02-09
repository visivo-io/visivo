


export const fetchDashboardsQuery = (projectId, names) => ({
    queryKey: ['dashboards', projectId, names],
    queryFn: async () => {
        return names.map((name) => {
            const hash = require('crypto').createHash('md5').update(name).digest('hex');

            return {
                "name": name,
                "id": name,
                "signed_thumbnail_file_url": `/data/${hash}/thumbnail.png`,
            }
        })
    }
})
