import { fetchProjectHistory } from '../api/project_history';

export const fetchProjectHistoryQuery = (projectId) => (
    {
        queryKey: ['projectHistory', projectId],
        queryFn: () => fetchProjectHistory(projectId),
        enabled: !!projectId
    }
)