import React, { useState, useEffect, useMemo } from 'react';
import DashboardCard from './DashboardCard';
import { HiChevronRight, HiInformationCircle } from 'react-icons/hi';
import { Tooltip } from 'flowbite-react';
import useStore from '../../stores/store';
import { getLevels, organizeDashboardsByLevel, defaultLevels } from '../../utils/dashboardUtils';

// Re-export for backward compatibility
export { getLevels, organizeDashboardsByLevel };

function DashboardSection({ title, dashboards, hasLevels, projectDefaults, projectId }) {
  const { searchTerm } = useStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const configuredLevels = projectDefaults?.levels || [];

  // Get level info based on title
  const levelIndex = title === 'unassigned' ? 'unassigned' : parseInt(title);

  // Get level info, first from configured levels, then fall back to default if needed
  let level = null;
  if (levelIndex !== 'unassigned') {
    level = configuredLevels[levelIndex] || defaultLevels[levelIndex];
  }

  // Get level title and description
  const levelTitle = level?.title || 'Unassigned';
  const levelDescription =
    level?.description || 'These dashboards are not yet organized into levels of importance.';

  // Modify title if it's unassigned and there are no levels
  const displayTitle = levelIndex === 'unassigned' && !hasLevels ? 'Dashboards' : levelTitle;

  // Sort dashboards alphabetically within the section
  const sortedDashboards = useMemo(() => {
    return [...dashboards].sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboards]);

  // Expand section if there's a search term and it matches any dashboard
  useEffect(() => {
    if (searchTerm && searchTerm.length > 0) {
      const hasMatch = sortedDashboards.some(
        dashboard =>
          dashboard.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (dashboard.description &&
            dashboard.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      if (hasMatch) {
        setIsCollapsed(false);
      }
    }
  }, [searchTerm, sortedDashboards]);

  if (!dashboards || dashboards.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center cursor-pointer group mb-3 pb-2 border-b border-gray-200">
        <div className="flex items-center flex-1" onClick={() => setIsCollapsed(!isCollapsed)}>
          <HiChevronRight
            className={`h-5 w-5 mr-2 text-gray-500 transform transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
          />
          <h2 className="text-xl font-semibold text-gray-900 group-hover:text-primary-500 transition-colors duration-200">
            {displayTitle}
          </h2>
          <span className="ml-3 text-sm text-gray-500">({dashboards.length})</span>
        </div>
        <Tooltip content={levelDescription} placement="right" className="max-w-xs" trigger="hover">
          <HiInformationCircle className="h-5 w-5 text-gray-400 hover:text-gray-600 ml-2 shrink-0" />
        </Tooltip>
      </div>
      <div
        className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-3 transition-all duration-200 ${
          isCollapsed ? 'hidden' : ''
        }`}
      >
        <div
          className={`col-span-full w-full flex flex-wrap gap-3 ${levelIndex === 'unassigned' ? 'justify-start' : 'justify-center'}`}
        >
          {sortedDashboards.map(dashboard => (
            <div
              key={dashboard.name}
              className="w-full sm:w-[calc(33.333%-0.5rem)] lg:w-[calc(25%-0.75rem)] xl:w-[calc(20%-0.8rem)] 2xl:w-[calc(16.666%-0.833rem)] 3xl:w-[calc(12.5%-0.875rem)]"
            >
              <DashboardCard projectId={projectId} dashboard={dashboard} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardSection;
