import { organizeDashboardsByLevel } from './DashboardSection';

describe('organizeDashboardsByLevel', () => {
  // Test data setup
  const projectView = {
    levels: [
      {
        title: "Chart Configuration",
        description: "Visuals that illustrate chart based configuration"
      },
      {
        title: "Trace Type Gallery",
        description: "Visuals that show all of the different things you can do with our 20+ trace types"
      }
    ]
  };

  const dashboards = [
    { name: "Basic Bar Chart", level: "Chart Configuration" },
    { name: "Advanced Bar Chart", level: "Chart Configuration" },
    { name: "Violin Plot", level: 1 },  // Should map to "Trace Type Gallery"
    { name: "Funnel Chart", level: "L3" }, // Should create new level
    { name: "Scatter Plot", level: undefined }, // Should go to unassigned
    { name: "Box Plot", level: 4 }, // Should create new level
  ];

  it('should combine project levels with defaults', () => {
    const result = organizeDashboardsByLevel(dashboards, projectView);
    
    // Should have levels 0, 1, 3, 4, and unassigned
    expect(Object.keys(result)).toEqual(['0', '1', '3', '4', 'unassigned']);
    
    // Level 0 (Chart Configuration) should have both bar charts
    expect(result['0'].map(d => d.name)).toEqual(['Advanced Bar Chart', 'Basic Bar Chart']);
    
    // Level 1 (Trace Type Gallery) should have violin plot
    expect(result['1'].map(d => d.name)).toEqual(['Violin Plot']);
    
    // Level 3 should have funnel chart
    expect(result['3'].map(d => d.name)).toEqual(['Funnel Chart']);
    
    // Level 4 should have box plot
    expect(result['4'].map(d => d.name)).toEqual(['Box Plot']);
    
    // Unassigned should have scatter plot
    expect(result.unassigned.map(d => d.name)).toEqual(['Scatter Plot']);
  });

  it('should handle empty project view', () => {
    const result = organizeDashboardsByLevel(dashboards, {});
    
    // Should fall back to default levels for numeric indices
    expect(result['1'].map(d => d.name)).toEqual(['Violin Plot']);
    expect(result.unassigned).toBeDefined();
  });

  it('should handle undefined project view', () => {
    const result = organizeDashboardsByLevel(dashboards, undefined);
    
    // Should fall back to default levels for numeric indices
    expect(result['1'].map(d => d.name)).toEqual(['Violin Plot']);
    expect(result.unassigned).toBeDefined();
  });

  it('should handle empty dashboards array', () => {
    const result = organizeDashboardsByLevel([], projectView);
    expect(result).toEqual({});
  });

  it('should handle numeric levels beyond configured levels', () => {
    const dashboardsWithHighLevel = [
      { name: "High Level Dashboard", level: 10 }
    ];
    
    const result = organizeDashboardsByLevel(dashboardsWithHighLevel, projectView);
    
    // Should create level 10 with generic title
    expect(result['10'].map(d => d.name)).toEqual(['High Level Dashboard']);
  });

  it('should handle case-insensitive level matching', () => {
    const dashboardsWithMixedCase = [
      { name: "Dashboard 1", level: "CHART CONFIGURATION" },
      { name: "Dashboard 2", level: "chart configuration" },
      { name: "Dashboard 3", level: "Chart Configuration" }
    ];
    
    const result = organizeDashboardsByLevel(dashboardsWithMixedCase, projectView);
    
    // All should be in level 0 (Chart Configuration)
    expect(result['0'].map(d => d.name).sort()).toEqual([
      'Dashboard 1',
      'Dashboard 2', 
      'Dashboard 3'
    ]);
  });

  it('should handle L{number} format levels', () => {
    const dashboardsWithLFormat = [
      { name: "Dashboard L0", level: "L0" },
      { name: "Dashboard L1", level: "l1" },
      { name: "Dashboard L5", level: "L5" }
    ];
    
    const result = organizeDashboardsByLevel(dashboardsWithLFormat, projectView);
    
    // Should map to correct numeric levels
    expect(result['0'].map(d => d.name)).toEqual(['Dashboard L0']);
    expect(result['1'].map(d => d.name)).toEqual(['Dashboard L1']);
    expect(result['5'].map(d => d.name)).toEqual(['Dashboard L5']);
  });
}); 