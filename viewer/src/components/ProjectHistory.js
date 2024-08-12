
import React from "react";
import { useMatches } from 'react-router-dom';


const ProjectHistory = () => {
    let matches = useMatches();
    let match = matches.find((match) => Boolean(match.id === "project"))

    if (!match || !match.data.created_at) {
        return null;
    }

    return (
        <span data-testid="project-history" className="mr-2">
            {new Date(Date.parse(match.data.created_at)).toLocaleString()}
        </span>
    );
}

export default ProjectHistory;

