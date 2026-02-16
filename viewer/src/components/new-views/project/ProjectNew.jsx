import React, { useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../../../stores/store';
import DashboardNew from './DashboardNew';
import Loading from '../../common/Loading';
import { Container } from '../../styled/Container';
import { HiTemplate } from 'react-icons/hi';
import DashboardSection from '../../project/DashboardSection';
import FilterBar from '../../project/FilterBar';

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

  // Organize dashboards by level for rendering
  const dashboardsByLevel = useMemo(() => {
    const grouped = {};
    dashboardsList.forEach(dashboard => {
      const level = dashboard.level ?? 'unassigned';
      if (!grouped[level]) {
        grouped[level] = [];
      }
      grouped[level].push(dashboard);
    });
    return grouped;
  }, [dashboardsList]);

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

  // Render dashboard list when no specific dashboard is selected
  if (!dashboardName) {
    return (
      <Container className="min-h-screen">
        <div className="max-w-[2000px] w-full mx-auto pt-1 px-4 sm:px-6 h-full">
          <div className="flex-1 w-full">
            {Object.entries(dashboardsByLevel).map(([level, dashboards]) => (
              <DashboardSection
                key={level}
                title={level}
                dashboards={dashboards}
                projectId={project.id}
                hasLevels={Object.keys(dashboardsByLevel).length > 1}
                projectDefaults={project?.project_json?.defaults}
              />
            ))}

            {dashboardsList.length === 0 && (
              <div className="w-full text-center py-8 bg-white rounded-lg shadow-2xs border border-gray-200">
                <HiTemplate className="mx-auto h-10 w-10 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No dashboards found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No dashboards available in this project.
                </p>
              </div>
            )}
          </div>
        </div>
      </Container>
    );
  }

  // Render specific dashboard
  return (
    <DashboardNew
      project={project}
      dashboardName={dashboardName}
    />
  );
}

export default ProjectNew;
