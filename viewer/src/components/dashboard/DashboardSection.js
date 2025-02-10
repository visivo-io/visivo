import React, { useState, useEffect, useMemo } from 'react';
import DashboardCard from './DashboardCard';
import { HiChevronRight, HiInformationCircle } from 'react-icons/hi';
import { Tooltip } from 'flowbite-react';

// Default levels if not provided by project view
const defaultLevels = [
  {
    title: "Organization",
    description: "The most important dashboards and metrics for the organization."
  },
  {
    title: "Department",
    description: "The most important dashboards & metrics for a department."
  },
  {
    title: "Team",
    description: "Individual department focused drill downs or sub-department metrics."
  },
  {
    title: "Individual",
    description: "Dashboards that track an individual or small groups metrics."
  },
  {
    title: "Operational",
    description: "Operational dashboards that are used to accomplish specific tasks."
  }
];

export const organizeDashboardsByLevel = (dashboards, projectView) => {
  if (!dashboards?.length) return {};

  const levels = projectView?.levels || defaultLevels;
  
  // Initialize levels object with indices as keys
  const leveledDashboards = {
    unassigned: []
  };
  
  levels.forEach((_, index) => {
    leveledDashboards[index] = [];
  });

  // Sort all dashboards into levels
  dashboards.forEach(dashboard => {
    if (!dashboard.level) {
      leveledDashboards.unassigned.push(dashboard);
    } else {
      // Handle both string and number level references
      const levelIndex = typeof dashboard.level === 'number' 
        ? dashboard.level 
        : levels.findIndex(l => l.title === dashboard.level);
      
      if (levelIndex >= 0 && levelIndex < levels.length) {
        leveledDashboards[levelIndex].push(dashboard);
      } else {
        leveledDashboards.unassigned.push(dashboard);
      }
    }
  });

  // Sort each level alphabetically
  Object.keys(leveledDashboards).forEach(level => {
    leveledDashboards[level].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Filter out empty levels
  return Object.fromEntries(
    Object.entries(leveledDashboards).filter(([_, dashboards]) => dashboards.length > 0)
  );
};

function DashboardSection({ title, dashboards, searchTerm, hasLevels, projectView }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const levels = projectView?.levels || defaultLevels;
  
  // Get level info based on title
  const levelIndex = title === 'unassigned' ? 'unassigned' : parseInt(title);
  const level = levelIndex === 'unassigned' ? null : levels[levelIndex];
  
  // Get level title and description
  const levelTitle = level?.title || 'Unassigned';
  const levelDescription = level?.description || "These dashboards are not yet organized into levels of importance.";
  
  // Modify title if it's unassigned and there are no levels
  const displayTitle = levelIndex === 'unassigned' && !hasLevels ? 'Dashboards' : levelTitle;

  // Sort dashboards alphabetically within the section
  const sortedDashboards = useMemo(() => {
    return [...dashboards].sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboards]);
  
  // Expand section if there's a search term and it matches any dashboard
  useEffect(() => {
    if (searchTerm && searchTerm.length > 0) {
      const hasMatch = sortedDashboards.some(dashboard => 
        dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description && dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      if (hasMatch) {
        setIsCollapsed(false);
      }
    }
  }, [searchTerm, sortedDashboards]);

  if (!dashboards || dashboards.length === 0) return null;
  
  return (
    <div className="mb-6">
      <div 
        className="flex items-center cursor-pointer group mb-3 pb-2 border-b border-gray-200"
      >
        <div 
          className="flex items-center flex-1"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <HiChevronRight 
            className={`h-5 w-5 mr-2 text-gray-500 transform transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
          />
          <h2 className="text-xl font-semibold text-gray-900 group-hover:text-primary-500 transition-colors duration-200">
            {displayTitle}
          </h2>
          <span className="ml-3 text-sm text-gray-500">({dashboards.length})</span>
        </div>
        <Tooltip
          content={levelDescription}
          placement="right"
          className="max-w-xs"
          trigger="hover"
        >
          <HiInformationCircle className="h-5 w-5 text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0" />
        </Tooltip>
      </div>
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-3 transition-all duration-200 ${
        isCollapsed ? 'hidden' : ''
      }`}>
        <div className={`col-span-full w-full flex flex-wrap gap-3 ${levelIndex === 'unassigned' ? 'justify-start' : 'justify-center'}`}>
          {sortedDashboards.map((dashboard) => (
            <div key={dashboard.name} className="w-full sm:w-[calc(33.333%-0.5rem)] lg:w-[calc(25%-0.75rem)] xl:w-[calc(20%-0.8rem)] 2xl:w-[calc(16.666%-0.833rem)] 3xl:w-[calc(12.5%-0.875rem)]">
              <DashboardCard 
                dashboard={dashboard} 
                thumbnail={dashboard.thumbnail}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardSection; 