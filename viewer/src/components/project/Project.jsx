import React, { useEffect } from 'react';
import Dashboard from './Dashboard';
import Loading from '../common/Loading';
import { Container } from '../styled/Container';
import { HiTemplate } from 'react-icons/hi';
import DashboardSection from './DashboardSection';
import FilterBar from './FilterBar';
import useStore from '../../stores/store';

function Project(props) {
  const {
    filteredDashboards,
    dashboardsByLevel,
    setDashboards,
    setCurrentDashboardName
  } = useStore();

  // Initialize dashboards in store when props change
  useEffect(() => {
    if (props.dashboards) {
      setDashboards(props.dashboards);
    }
  }, [props.dashboards, setDashboards]);

  // Update current dashboard name when it changes
  useEffect(() => {
    setCurrentDashboardName(props.dashboardName);
  }, [props.dashboardName, setCurrentDashboardName]);

  const renderLoading = () => {
    return <Loading />;
  };

  const renderDashboardList = () => {
    return (
      <Container className="min-h-screen">
        <div className="max-w-[2000px] w-full mx-auto pt-1 px-4 sm:px-6 h-full">
          <FilterBar />

          <div className="flex-1 w-full">
            {Object.entries(dashboardsByLevel).map(([level, dashboards]) => (
              <DashboardSection
                key={level}
                title={level}
                dashboards={dashboards.map(dashboard => ({
                  ...dashboard,
                }))}
                projectId={props.project.id}
                hasLevels={Object.keys(dashboardsByLevel).length > 0}
                projectDefaults={props.project?.project_json?.defaults}
              />
            ))}

            {filteredDashboards.length === 0 && (
              <div className="w-full text-center py-8 bg-white rounded-lg shadow-2xs border border-gray-200">
                <HiTemplate className="mx-auto h-10 w-10 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No dashboards found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No dashboards match your search criteria.
                </p>
              </div>
            )}
          </div>
        </div>
      </Container>
    );
  };

  const renderDashboard = project => {
    return <Dashboard project={project} dashboardName={props.dashboardName} />;
  };

  if (props.project && !props.dashboardName) {
    return renderDashboardList(props.project);
  } else if (props.project && props.dashboardName) {
    return renderDashboard(props.project);
  } else {
    return renderLoading();
  }
}

export default Project;
