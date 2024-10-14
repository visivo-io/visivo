
import React, { useContext } from "react";
import { useRouteLoaderData } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query'
import QueryContext from '../contexts/QueryContext'
const ProjectHistory = () => {
    let project = useRouteLoaderData('project')

    const { fetchProjectHistoryQuery } = useContext(QueryContext);

    const { data, isLoading, isError } = useQuery(fetchProjectHistoryQuery(project?.id))

    if (!project || !project.id || isLoading || isError) {
        return null;
    }

    return (
        <span data-testid="project-history" className="mr-2">
            <select defaultValue={project.id}>
                {data.map((history_project) => (
                    <option key={history_project.id} value={history_project.id}>
                        {new Date(Date.parse(history_project.created_at)).toLocaleString()}
                    </option>
                ))}
            </select>
        </span>
    );
}

export default ProjectHistory;

