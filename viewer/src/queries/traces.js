import { fetchTraces } from '../api/traces'

export const fetchTracesQuery = (projectId, names) => ({
    queryKey: ['trace', projectId, names],
    queryFn: async () => fetchTraces(projectId, names),
})
