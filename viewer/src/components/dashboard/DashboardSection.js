import React, { useState, useEffect, useMemo } from 'react';
import DashboardCard from './DashboardCard';
import { HiChevronRight, HiInformationCircle } from 'react-icons/hi';
import { Tooltip } from 'flowbite-react';

// Default level descriptions if not provided by project view
const defaultLevelDescriptions = {
  L0: "The most important dashboards and metrics for the organization.",
  L1: "The most important dashboards & metrics for a department.",
  L2: "Individual department focused drill downs or sub-department metrics.",
  L3: "Dashboards that track an individual or small groups metrics.",
  L4: "Operational dashboards that are used to accomplish specific tasks.",
  unassigned: "These dashboards are not yet organized into levels of importance."
};

export const organizeDashboardsByLevel = (dashboards, projectView) => {
  if (!dashboards?.length) return {};

  // Initialize levels
  const levels = {
    L0: [],
    L1: [],
    L2: [],
    L3: [],
    L4: [],
    unassigned: []
  };

  // Sort all dashboards into levels
  dashboards.forEach(dashboard => {
    if (!dashboard.level) {
      levels.unassigned.push(dashboard);
    } else {
      levels[dashboard.level].push(dashboard);
    }
  });

  // Sort each level alphabetically
  Object.keys(levels).forEach(level => {
    levels[level].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Filter out empty levels
  return Object.fromEntries(
    Object.entries(levels).filter(([_, dashboards]) => dashboards.length > 0)
  );
};

function DashboardSection({ title, dashboards, searchTerm, hasLevels, projectView }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Determine the level from the title
  const level = title.startsWith('L') ? title.split(' ')[0] : 'unassigned';
  
  // Get custom level description and name if available
  const levelCustomization = projectView?.level?.[level];
  const levelDescription = levelCustomization?.description || defaultLevelDescriptions[level];
  
  // Modify title if it's unassigned and there are no levels, or use custom name if available
  const displayTitle = level === 'unassigned' && !hasLevels ? 'Dashboards' : 
    levelCustomization?.name || title;

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
        <div className={`col-span-full w-full flex flex-wrap gap-3 ${level === 'unassigned' ? 'justify-start' : 'justify-center'}`}>
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