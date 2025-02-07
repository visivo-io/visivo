import React, { useState, useMemo, useEffect } from "react";
import Dashboard from "./Dashboard";
import Loading from "./Loading";
import { Container } from "./styled/Container";
import { HiTemplate } from 'react-icons/hi';
import DashboardSection from './dashboard/DashboardSection';
import FilterBar from './dashboard/FilterBar';
import { fetchDashboardThumbnails } from '../services/thumbnailService';

function Project(props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [thumbnails, setThumbnails] = useState({});

  // Reset scroll position when dashboard changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [props.dashboardName]);

  // Load existing thumbnails from API
  useEffect(() => {
    if (props.dashboards && props.dashboards.length > 0) {
      fetchDashboardThumbnails(props.dashboards, (dashboardName, thumbnail) => {
        setThumbnails(prev => ({
          ...prev,
          [dashboardName]: thumbnail
        }));
      });
    }
  }, [props.dashboards]);

  const availableTags = useMemo(() => {
    if (!props.dashboards) return [];
    const tagSet = new Set();
    props.dashboards.forEach(dashboard => {
      if (dashboard.tags) {
        dashboard.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet);
  }, [props.dashboards]);

  const filteredDashboards = useMemo(() => {
    if (!props.dashboards) return [];
    return props.dashboards.filter(dashboard => {
      const matchesSearch = dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description && dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTags = selectedTags.length === 0 ||
        (dashboard.tags && selectedTags.every(tag => dashboard.tags.includes(tag)));
      return matchesSearch && matchesTags;
    });
  }, [props.dashboards, searchTerm, selectedTags]);

  const dashboardsByLevel = useMemo(() => {
    const levels = {
      L0: [],
      L1: [],
      L2: [],
      L3: [],
      L4: [],
      unassigned: []
    };

    filteredDashboards.forEach(dashboard => {
      if (!dashboard.level) {
        levels.unassigned.push(dashboard);
      } else {
        levels[dashboard.level].push(dashboard);
      }
    });

    // Sort dashboards alphabetically within each level
    Object.keys(levels).forEach(level => {
      levels[level].sort((a, b) => a.name.localeCompare(b.name));
    });

    return Object.fromEntries(
      Object.entries(levels).filter(([_, dashboards]) => dashboards.length > 0)
    );
  }, [filteredDashboards]);

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
                title={level === 'unassigned' ? 'Unassigned Dashboards' : `${level} Dashboards`}
                dashboards={dashboards.map(dashboard => ({
                  ...dashboard,
                  thumbnail: thumbnails[dashboard.name]
                }))}
                searchTerm={searchTerm}
                hasLevels={Object.keys(dashboardsByLevel).some(key => key.startsWith('L'))}
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

