import React, { useMemo } from 'react';
import { useParams, useLoaderData } from 'react-router-dom';
import Project from './Project';
import { useUrlSync } from '../../hooks/useUrlSync';

function ProjectContainer() {
  const { dashboardName } = useParams();
  const project = useLoaderData();

  // Initialize URL synchronization for selectors
  useUrlSync();

  const dashboards = useMemo(() => {
    if (!project) {
      return [];
    }
    return project.project_json.dashboards.map(dashboard => {
      return {
        name: dashboard.name,
        description: dashboard.description,
        tags: dashboard.tags || [],
        level: dashboard.level,
        type: dashboard.type,
        href: dashboard.href || null,
        path: '',
      };
    });
  }, [project]);

  return <Project project={project} dashboards={dashboards} dashboardName={dashboardName} />;
}

export default ProjectContainer;
