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