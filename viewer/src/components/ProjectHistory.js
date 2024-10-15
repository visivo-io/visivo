
import React, { useContext } from "react";
import { useParams, useRouteLoaderData, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query'
import QueryContext from '../contexts/QueryContext'

const ProjectHistory = () => {
    let project = useRouteLoaderData('project')

    const { fetchProjectHistoryQuery } = useContext(QueryContext);
    const { accountSlug, stageName, projectName, dashboardName } = useParams()

    const navigate = useNavigate()

    const { data, isLoading, isError } = useQuery(fetchProjectHistoryQuery(project?.id))

    const onChange = (event) => {
        let projectIdUrl = projectName
        if (project.id !== event.target.value) {
            projectIdUrl = `${event.target.value}`
        }
        const dashboardNameUrl = dashboardName ? `/${dashboardName}` : ""

        const url = `/${accountSlug}/${stageName}/${projectIdUrl}${dashboardNameUrl}`
        navigate(url)
    }

    if (!project || !project.id || isLoading || isError) {
        return null;
    }

    const renderSelect = (history) => {
        if (!history || history.length === 1) {
            return (
                <span data-testid="project-history">
                    {new Date(Date.parse(project.created_at)).toLocaleString()}
                </span>
            )
        } else {
            return (
                <select data-testid="project-history-select" value={project.id} onChange={onChange}>
                    {history.map((history_project) => (
                        <option key={history_project.id} value={history_project.id}>
                            {new Date(Date.parse(history_project.created_at)).toLocaleString()}
                        </option>
                    ))}
                </select>
            )
        }
    }

    return (
        <span className="mr-2">
            {renderSelect(data)}
        </span>
    );
}

export default ProjectHistory;

