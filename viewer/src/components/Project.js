import React, { useState, useMemo } from "react";
import { Link } from 'react-router-dom';
import Dashboard from "./Dashboard";
import Loading from "./Loading";
import Heading from "./styled/Heading";
import { Container } from "./styled/Container";
import { TextInput, Badge, Card, Tooltip } from 'flowbite-react';
import { HiSearch } from 'react-icons/hi';

function DashboardCard({ dashboard }) {
  return (
    <Tooltip content={dashboard.description || "No description available"}>
      <Link to={dashboard.name} className="block">
        <Card className="h-full hover:bg-gray-50 transition-colors">
          <div className="h-32 bg-gray-100 rounded-lg mb-4">
            {/* TODO: Add dashboard thumbnail preview here */}
            <div className="flex items-center justify-center h-full text-gray-400">
              Preview Coming Soon
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{dashboard.name}</h3>
          {dashboard.level && (
            <Badge color="info" size="sm" className="mb-2">
              Level {dashboard.level}
            </Badge>
          )}
          {dashboard.tags && dashboard.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {dashboard.tags.map(tag => (
                <Badge key={tag} color="gray" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </Link>
    </Tooltip>
  );
}

function DashboardSection({ title, dashboards }) {
  if (!dashboards || dashboards.length === 0) return null;
  
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {dashboards.map((dashboard) => (
          <DashboardCard key={dashboard.name} dashboard={dashboard} />
        ))}
      </div>
    </div>
  );
}

function FilterBar({ searchTerm, setSearchTerm, selectedTags, setSelectedTags, availableTags }) {
  return (
    <div className="mb-8 space-y-4">
      <div>
        <TextInput
          id="search"
          type="text"
          icon={HiSearch}
          placeholder="Search dashboards..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
      </div>
      {availableTags.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by tags
          </label>
          <div className="flex flex-wrap gap-2">
            {availableTags.map(tag => (
              <Badge
                key={tag}
                color={selectedTags.includes(tag) ? "info" : "gray"}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedTags(prev =>
                    prev.includes(tag)
                      ? prev.filter(t => t !== tag)
                      : [...prev, tag]
                  );
                }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Project(props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

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

    // Only return levels that have dashboards
    return Object.fromEntries(
      Object.entries(levels).filter(([_, dashboards]) => dashboards.length > 0)
    );
  }, [filteredDashboards]);

  const renderLoading = () => {
    return <Loading />;
  };

  const renderDashboardList = () => {
    return (
      <Container>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <Heading>Dashboards</Heading>
            <div className="text-sm text-gray-500">
              {filteredDashboards.length} dashboard{filteredDashboards.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          <FilterBar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            availableTags={availableTags}
          />

          {Object.entries(dashboardsByLevel).map(([level, dashboards]) => (
            <DashboardSection
              key={level}
              title={level === 'unassigned' ? 'Other Dashboards' : `Level ${level} Dashboards`}
              dashboards={dashboards}
            />
          ))}

          {filteredDashboards.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No dashboards found matching your criteria</p>
            </div>
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

