
import React from "react";
import { useParams, useLoaderData } from 'react-router-dom';
import Project from "./Project";

function ProjectContainer() {
  const { dashboardName } = useParams();
  const { project, fetchTraces } = useLoaderData();

  const dashboards = (project) => {
    if (!project) {
      return [];
    }
    return project.project_json.dashboards.map((dashboard) => {
      return { name: dashboard.name, path: "" }
    });
  }

  return (
    <Project project={project}
      fetchTraces={fetchTraces}
      dashboards={dashboards(project)}
      dashboardName={dashboardName} />)

}

export default ProjectContainer;

