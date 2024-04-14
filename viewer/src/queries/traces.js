import { fetchTraces } from '../api/traces'

export const fetchTraceQuery = (projectId, name) => ({
    queryKey: ['trace', projectId, name],
    queryFn: async () => fetchTraces(projectId, [name]),
})
