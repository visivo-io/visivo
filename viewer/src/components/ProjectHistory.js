
import React from "react";
import { useRouteLoaderData } from 'react-router-dom';

const ProjectHistory = () => {
    let project = useRouteLoaderData('project')

    if (!project || !project.id) {
        return null;
    }

    return (
        <span className="mr-2" data-testid="project-history">
            {new Date(Date.parse(project.created_at)).toLocaleString()}
        </span>
    );
}

export default ProjectHistory;

