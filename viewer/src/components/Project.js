import React, { useState, useMemo, useEffect } from "react";
import Dashboard from "./Dashboard";
import Loading from "./Loading";
import Heading from "./styled/Heading";
import { Container } from "./styled/Container";
import { HiTemplate } from 'react-icons/hi';
import DashboardThumbnail from './thumbnail/DashboardThumbnail';
import DashboardSection from './dashboard/DashboardSection';
import FilterBar from './dashboard/FilterBar';

function Project(props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [thumbnailQueue, setThumbnailQueue] = useState([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);

  // Reset scroll position when dashboard changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [props.dashboardName]);

  // Initialize thumbnail generation queue
  useEffect(() => {
    if (props.dashboards && props.dashboards.length > 0 && thumbnailQueue.length === 0) {
      const dashboardsToGenerate = props.dashboards
        .filter(d => !thumbnails[d.name])
        .sort((a, b) => {
          // First sort by level
          const levelOrder = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, undefined: 5 };
          const levelDiff = (levelOrder[a.level] || levelOrder.undefined) - (levelOrder[b.level] || levelOrder.undefined);
          
          // If same level, sort alphabetically
          if (levelDiff === 0) {
            return a.name.localeCompare(b.name);
          }
          return levelDiff;
        })
        .map(d => d.name);

      if (dashboardsToGenerate.length > 0) {
        setThumbnailQueue(dashboardsToGenerate);
      }
    }
  }, [props.dashboards, thumbnails, thumbnailQueue]);

  // Process thumbnail queue with delay
  useEffect(() => {
    if (thumbnailQueue.length > 0 && !isGeneratingThumbnails) {
      const currentDashboard = props.dashboards.find(d => d.name === thumbnailQueue[0]);
      if (currentDashboard) {
        setIsGeneratingThumbnails(true);
      }
    }
  }, [thumbnailQueue, isGeneratingThumbnails, props.dashboards]);

  const handleThumbnailGenerated = (dashboardName, thumbnail) => {
    setThumbnails(prev => ({
      ...prev,
      [dashboardName]: thumbnail
    }));
    setIsGeneratingThumbnails(false);
    setThumbnailQueue(prev => prev.filter(name => name !== dashboardName));
  };

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

          {/* Hidden thumbnail generator */}
          {isGeneratingThumbnails && thumbnailQueue[0] && (
            <DashboardThumbnail
              dashboard={props.dashboards.find(d => d.name === thumbnailQueue[0])}
              project={props.project}
              onThumbnailGenerated={handleThumbnailGenerated}
            />
          )}
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

