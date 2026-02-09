import React, { useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../../../stores/store';
import DashboardNew from './DashboardNew';
import Loading from '../../common/Loading';

/**
 * ProjectNew - Container component for the new project view
 * Fetches data from stores and passes to DashboardNew
 * Similar to ProjectContainer but uses stores instead of project_json
 */
function ProjectNew() {
  const { dashboardName } = useParams();

  // Store access
  const project = useStore(state => state.project);
  const dashboards = useStore(state => state.dashboards);
  const dashboardsLoading = useStore(state => state.dashboardsLoading);
  const fetchDashboards = useStore(state => state.fetchDashboards);

  // Fetch dashboards on mount
  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  // Transform dashboards for navigation (similar to ProjectContainer)
  const dashboardsList = useMemo(() => {
    if (!dashboards) {
      return [];
    }
    return dashboards.map(dashboard => ({
      name: dashboard.name,
      description: dashboard.config?.description || dashboard.description,
      tags: dashboard.config?.tags || dashboard.tags || [],
      level: dashboard.config?.level || dashboard.level,
      type: dashboard.config?.type || dashboard.type,
      href: dashboard.config?.href || dashboard.href || null,
      path: '',
    }));
  }, [dashboards]);

  // Loading state
  if (dashboardsLoading) {
    return <Loading />;
  }

  // No project
  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">No project loaded</div>
      </div>
    );
  }

  // No dashboards
  if (!dashboards || dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">No dashboards found</div>
      </div>
    );
  }

  // Get the current dashboard or default to first
  const currentDashboardName = dashboardName || dashboards[0]?.name;

  return (
    <DashboardNew
      project={project}
      dashboardName={currentDashboardName}
      dashboards={dashboardsList}
    />
  );
}

export default ProjectNew;
