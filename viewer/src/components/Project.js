import React, { useState, useMemo, useEffect, useContext } from "react";
import Dashboard from "./Dashboard";
import Loading from "./Loading";
import { Container } from "./styled/Container";
import { HiTemplate } from 'react-icons/hi';
import DashboardSection, { organizeDashboardsByLevel } from './dashboard/DashboardSection';
import FilterBar from './dashboard/FilterBar';
import QueryContext from "../contexts/QueryContext";
import { fetchDashboardThumbnail } from "../queries/dashboardThumbnails";
import { useQuery } from '@tanstack/react-query';

function Project(props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const { fetchDashboardQuery } = useContext(QueryContext);

  // Reset scroll position when dashboard changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [props.dashboardName]);

  // Combine internal and external dashboards
  const allDashboards = props.dashboards;

  const internalDashboards = allDashboards.filter(dashboard => dashboard.type === 'internal');

  // Use React Query to handle thumbnail loading
  const projectId = props.project?.id || props.project?.project_id;
  const { data: thumbnails = {} } = useQuery({
    queryKey: ['dashboards', projectId],
    queryFn: async () => {
      if (!projectId || allDashboards.length === 0) {
        return {};
      }

      try {
        const dashboardNames = allDashboards.map(d => d.name);
        const results = await Promise.all(
          dashboardNames.map(async dashboardName=> {
            const query = fetchDashboardQuery(projectId, dashboardName);
            const dashboardData = await query.queryFn();
            if (dashboardData) {
              try {
                if (internalDashboards.map(d => d.name).includes(dashboardData.name)) {
                  const thumbnail = await fetchDashboardThumbnail(dashboardData);
                  return [dashboardData.name, thumbnail];
                } else {
                  return [dashboardData.name, null];
                }
              } catch (e) {
                return null;
              }
            }
            return null;
          })
        );

        return Object.fromEntries(results.filter(Boolean));
      } catch (e) {
        throw e;
      }
    },
    enabled: Boolean(projectId) && allDashboards.length > 0,
    staleTime: Infinity
  });

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
      const matchesSearch = dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description && dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTags = selectedTags.length === 0 ||
        (dashboard.tags && selectedTags.every(tag => dashboard.tags.includes(tag)));
      return matchesSearch && matchesTags;
    });
  }, [allDashboards, searchTerm, selectedTags]);

  const dashboardsByLevel = useMemo(() => 
    organizeDashboardsByLevel(filteredDashboards, props.project?.project_json?.defaults),
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
                  thumbnail: thumbnails[dashboard.name]
                }))}
                searchTerm={searchTerm}
                hasLevels={dashboardsByLevel.length > 0}
                projectDefaults={props.project?.project_json?.defaults}
              />
            ))}

            {filteredDashboards.length === 0 && (
              <div className="w-full text-center py-8 bg-white rounded-lg shadow-sm border border-gray-200">
                <HiTemplate className="mx-auto h-10 w-10 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No dashboards found</h3>
                <p className="mt-1 text-sm text-gray-500">No dashboards match your search criteria.</p>
              </div>
            )}
          </div>
        </div>
      </Container>
    );
  };

  const renderDashboard = (project) => {
    return (
      <Dashboard project={project} dashboardName={props.dashboardName} />
    );
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

