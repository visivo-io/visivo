import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Dashboard from './Dashboard';
import Loading from '../common/Loading';
import { Container } from '../styled/Container';
import { HiTemplate } from 'react-icons/hi';
import DashboardSection, { organizeDashboardsByLevel } from './DashboardSection';
import FilterBar from './FilterBar';
import useStore from '../../stores/store';

function Project(props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const setScrollPosition = useStore(state => state.setScrollPosition);
  const scrollPositions = useStore(state => state.scrollPositions[props.dashboardName]);

  const handleScroll = useCallback(() => {
    console.log("savedPos: ", window.scrollY)
    setScrollPosition(props.dashboardName, window.scrollY);
  }, [props.dashboardName, setScrollPosition]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);

  }, [handleScroll]);

  useEffect(() => {
    console.log("scrollPositions, ", useStore.getState())
    const savedPos = scrollPositions || 0;
    if (!window.location.hash) {
        window.scrollTo(0, savedPos);
    }

  }, [props.dashboardName, scrollPositions]);



  // Combine internal and external dashboards
  const allDashboards = props.dashboards;

  const availableTags = useMemo(() => {
    if (!allDashboards.length) return [];
    const tagSet = new Set();
    allDashboards.forEach(dashboard => {
      if (dashboard.tags) {
        dashboard.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet);
  }, [allDashboards]);

  const filteredDashboards = useMemo(() => {
    if (!allDashboards.length) return [];
    return allDashboards.filter(dashboard => {
      const matchesSearch =
        dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description &&
          dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTags =
        selectedTags.length === 0 ||
        (dashboard.tags && selectedTags.every(tag => dashboard.tags.includes(tag)));
      return matchesSearch && matchesTags;
    });
  }, [allDashboards, searchTerm, selectedTags]);

  const dashboardsByLevel = useMemo(
    () => organizeDashboardsByLevel(filteredDashboards, props.project?.project_json?.defaults),
    [filteredDashboards, props.project?.project_json?.defaults]
  );

  const renderLoading = () => {
    return <Loading />;
  };

  const renderDashboardList = () => {
    return (
      <Container className="min-h-screen">
        <div className="max-w-[2000px] w-full mx-auto pt-1 px-4 sm:px-6 h-full">
          <FilterBar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            availableTags={availableTags}
            totalCount={filteredDashboards.length}
          />

          <div className="flex-1 w-full">
            {Object.entries(dashboardsByLevel).map(([level, dashboards]) => (
              <DashboardSection
                key={level}
                title={level}
                dashboards={dashboards.map(dashboard => ({
                  ...dashboard,
                }))}
                projectId={props.project.id}
                searchTerm={searchTerm}
                hasLevels={dashboardsByLevel.length > 0}
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
