import React, { useState, useEffect } from 'react';
import DashboardCard from './DashboardCard';
import { HiChevronRight, HiInformationCircle } from 'react-icons/hi';
import { Tooltip } from 'flowbite-react';

const levelDescriptions = {
  L0: "The most important dashboards and metrics for the organization.",
  L1: "The most important dashboards & metrics for a department.",
  L2: "Individual department focused drill downs or sub-department metrics.",
  L3: "Dashboards that track an individual or small groups metrics.",
  L4: "Operational dashboards that are used to accomplish specific tasks.",
  unassigned: "These dashboards are not yet organized into levels of importance."
};

function DashboardSection({ title, dashboards, searchTerm, hasLevels }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Determine the level from the title
  const level = title.startsWith('L') ? title.split(' ')[0] : 'unassigned';
  
  // Modify title if it's unassigned and there are no levels
  const displayTitle = level === 'unassigned' && !hasLevels ? 'Dashboards' : title;
  
  // Expand section if there's a search term and it matches any dashboard
  useEffect(() => {
    if (searchTerm && searchTerm.length > 0) {
      const hasMatch = dashboards.some(dashboard => 
        dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dashboard.description && dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      if (hasMatch) {
        setIsCollapsed(false);
      }
    }
  }, [searchTerm, dashboards]);

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
          content={levelDescriptions[level]}
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
        {dashboards.map((dashboard) => (
          <DashboardCard 
            key={dashboard.name} 
            dashboard={dashboard} 
            thumbnail={dashboard.thumbnail}
          />
        ))}
      </div>
    </div>
  );
}

export default DashboardSection; 