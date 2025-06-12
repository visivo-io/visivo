import React, { useState, useEffect, useMemo } from 'react';
import DashboardCard from './DashboardCard';
import { HiChevronRight, HiInformationCircle } from 'react-icons/hi';
import { Tooltip } from 'flowbite-react';

function mergeLists(left, right) {
  return [...left, ...right.slice(-left.length)];
}

// Default levels if not provided by project view - used only for indices that don't have definitions
const defaultLevels = [
  {
    title: 'Organization',
    description: 'The most important dashboards and metrics for the organization.',
  },
  {
    title: 'Department',
    description: 'The most important dashboards & metrics for a department.',
  },
  {
    title: 'Team',
    description: 'Individual department focused drill downs or sub-department metrics.',
  },
  {
    title: 'Individual',
    description: 'Dashboards that track an individual or small groups metrics.',
  },
  {
    title: 'Operational',
    description: 'Operational dashboards that are used to accomplish specific tasks.',
  },
];
export const getLevels = projectDefaults => {
  return mergeLists(projectDefaults?.levels || [], defaultLevels);
};

export const organizeDashboardsByLevel = (dashboards, projectDefaults) => {
  if (!dashboards?.length) return {};

  const configuredLevels = getLevels(projectDefaults);

  // Initialize levels object with indices as keys
  const leveledDashboards = {
    unassigned: [],
  };

  // Initialize arrays for all possible indices
  const maxIndex = Math.max(
    defaultLevels.length - 1,
    configuredLevels.length - 1,
    ...dashboards.map(d => {
      if (typeof d.level === 'number') return d.level;
      if (typeof d.level === 'string' && d.level.match(/^L\d+$/i)) {
        return Number(d.level.substring(1));
      }
      return -1;
    })
  );

  for (let i = 0; i <= maxIndex; i++) {
    leveledDashboards[i] = [];
  }

  // Sort all dashboards into levels
  dashboards.forEach(dashboard => {
    if (dashboard.level === undefined || dashboard.level === null) {
      leveledDashboards.unassigned.push(dashboard);
      return;
    }

    let levelIndex = -1;

    if (typeof dashboard.level === 'string') {
      // Try to match by title in configured levels
      const titleIndex = configuredLevels.findIndex(
        l => l.title.toLowerCase() === dashboard.level.toLowerCase()
      );

      // Try to parse as number
      let numericLevel = Number(dashboard.level);

      // If not a direct number, check if it's in the format "L{number}"
      if (isNaN(numericLevel) && dashboard.level.match(/^L\d+$/i)) {
        numericLevel = Number(dashboard.level.substring(1));
      }

      // Use title match if found, otherwise use numeric if valid
      if (titleIndex !== -1) {
        levelIndex = titleIndex;
      } else if (!isNaN(numericLevel)) {
        levelIndex = numericLevel;
      }
    } else if (typeof dashboard.level === 'number') {
      levelIndex = dashboard.level;
    }

    // Add to appropriate level if index is valid and within maxIndex
    if (levelIndex >= 0 && levelIndex <= maxIndex) {
      leveledDashboards[levelIndex].push(dashboard);
    } else {
      leveledDashboards.unassigned.push(dashboard);
    }
  });

  // Sort each level alphabetically
  Object.keys(leveledDashboards).forEach(level => {
    leveledDashboards[level].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Filter out empty levels and ensure they're ordered by index
  const entries = Object.entries(leveledDashboards)
    .filter(([_, dashboards]) => dashboards.length > 0)
    .sort(([a], [b]) => {
      // Keep unassigned at the end
      if (a === 'unassigned') return 1;
      if (b === 'unassigned') return -1;
      return parseInt(a) - parseInt(b);
    });

  return Object.fromEntries(entries);
};

function DashboardSection({ title, dashboards, searchTerm, hasLevels, projectDefaults }) {
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
              <DashboardCard dashboard={dashboard} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardSection;
