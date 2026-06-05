import { groupDashboardsByLevel, buildHealthSummary, UNASSIGNED_KEY } from './useProjectEditorData';

const dash = (name, level, extra = {}) => ({
  name,
  config: { level, ...extra },
});

describe('groupDashboardsByLevel', () => {
  const defaults = {
    levels: [
      { title: 'Organization' },
      { title: 'Department' },
      { title: 'Team' },
    ],
  };

  test('groups dashboards by configured level title in defaults.levels order', () => {
    const groups = groupDashboardsByLevel(
      [dash('exec', 'Organization'), dash('sales', 'Department'), dash('rev', 'Organization')],
      defaults
    );
    // Explicitly-configured levels ALL render (even empty ones) so a newly-added
    // level is a visible drop target — VIS-901. Team has no dashboards but still
    // shows as an empty droppable section.
    expect(groups.map(g => g.title)).toEqual(['Organization', 'Department', 'Team']);
    expect(groups[0].dashboards.map(d => d.name)).toEqual(['exec', 'rev']);
    expect(groups[1].dashboards.map(d => d.name)).toEqual(['sales']);
    expect(groups[2].dashboards).toEqual([]);
  });

  test('resolves numeric and L-prefixed levels to configured titles', () => {
    const groups = groupDashboardsByLevel(
      [dash('byNum', 0), dash('byL', 'L1')],
      defaults
    );
    const titles = groups.map(g => g.title);
    expect(titles).toContain('Organization');
    expect(titles).toContain('Department');
  });

  test('places dashboards without a level into a trailing Unassigned group', () => {
    const groups = groupDashboardsByLevel(
      [dash('exec', 'Organization'), dash('orphan', undefined)],
      defaults
    );
    const last = groups[groups.length - 1];
    expect(last.levelKey).toBe(UNASSIGNED_KEY);
    expect(last.title).toBe('Unassigned');
    expect(last.levelValue).toBeNull();
    expect(last.dashboards.map(d => d.name)).toEqual(['orphan']);
  });

  test('levelValue is the configured title so a drop writes a readable level', () => {
    const groups = groupDashboardsByLevel([dash('exec', 'Organization')], defaults);
    expect(groups[0].levelValue).toBe('Organization');
  });

  test('shows empty leading levels as drop targets when a later level is populated', () => {
    const groups = groupDashboardsByLevel([dash('teamA', 'Team')], defaults);
    // Organization + Department empty but precede populated Team — all shown.
    expect(groups.map(g => g.title)).toEqual(['Organization', 'Department', 'Team']);
  });

  test('falls back to defaultLevels when defaults has no levels', () => {
    const groups = groupDashboardsByLevel([dash('exec', 'Organization')], null);
    expect(groups[0].title).toBe('Organization');
  });

  test('renders all configured levels (as empty drop targets) when there are no dashboards', () => {
    // With levels explicitly configured, every level is a real user-created
    // bucket and renders as an empty droppable section — VIS-901. No Unassigned
    // group is added because there are no orphaned dashboards.
    const groups = groupDashboardsByLevel([], defaults);
    expect(groups.map(g => g.title)).toEqual(['Organization', 'Department', 'Team']);
    groups.forEach(g => expect(g.dashboards).toEqual([]));
  });

  test('returns empty array for no dashboards and no configured levels', () => {
    expect(groupDashboardsByLevel([], { levels: [] })).toEqual([]);
  });
});

describe('buildHealthSummary', () => {
  test('counts each collection and collapses the three model stores', () => {
    const summary = buildHealthSummary({
      dashboards: [1, 2, 3, 4],
      insights: new Array(14).fill(0),
      models: [1, 2, 3, 4, 5],
      csvScriptModels: [1, 2],
      localMergeModels: [1],
      sources: [1, 2, 3],
    });
    expect(summary).toEqual({ dashboards: 4, insights: 14, models: 8, sources: 3 });
  });

  test('defaults missing collections to zero', () => {
    expect(buildHealthSummary({})).toEqual({
      dashboards: 0,
      insights: 0,
      models: 0,
      sources: 0,
    });
  });
});
