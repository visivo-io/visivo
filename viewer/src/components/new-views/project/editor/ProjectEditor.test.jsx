/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import ProjectEditor from './ProjectEditor';
import useStore from '../../../../stores/store';
import { setWorkspaceTelemetryListener } from '../../workspace/telemetry';

const makeDashboard = (name, level, extra = {}) => ({
  name,
  status: 'PUBLISHED',
  config: { level, tags: [], ...extra },
});

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      project: { id: 'proj-1', name: 'analytics-platform' },
      defaults: { levels: [{ title: 'Organization' }, { title: 'Department' }] },
      dashboards: [
        makeDashboard('exec', 'Organization'),
        makeDashboard('sales', 'Department'),
        makeDashboard('orphan', undefined),
      ],
      insights: [{ name: 'a' }, { name: 'b' }],
      models: [{ name: 'm1' }],
      csvScriptModels: [],
      localMergeModels: [],
      sources: [{ name: 's1' }, { name: 's2' }, { name: 's3' }],
      // VIS-1013 governance collections + their lazy fetchers. Seeded non-empty
      // so the mount-time fetch-if-empty stays a no-op in most tests.
      relations: [
        {
          name: 'local_to_local',
          status: 'PUBLISHED',
          config: { join_type: 'inner', condition: '${ref(m1).id} = ${ref(m2).id}' },
        },
      ],
      metrics: [{ name: 'revenue', config: { name: 'revenue', expression: 'sum(amount)' } }],
      dimensions: [{ name: 'region', config: { name: 'region', expression: 'addr_region' } }],
      fetchRelations: jest.fn(),
      fetchMetrics: jest.fn(),
      fetchDimensions: jest.fn(),
      workspaceActiveObject: null,
      openWorkspaceTab: jest.fn(),
      reassignDashboardLevel: jest.fn(),
      createLevel: jest.fn(),
      renameLevel: jest.fn(),
      reorderLevel: jest.fn(),
      deleteLevel: jest.fn(),
      fetchDashboards: jest.fn(),
      createDashboard: jest.fn().mockResolvedValue({ success: true, name: 'new-dashboard' }),
      ...extra,
    });
  });
};

describe('ProjectEditor', () => {
  beforeEach(() => seed());

  test('renders the project health summary with collapsed model count', () => {
    render(<ProjectEditor />);
    const health = screen.getByTestId('project-editor-health');
    expect(within(screen.getByTestId('project-editor-health-dashboards')).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByTestId('project-editor-health-insights')).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('project-editor-health-models')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('project-editor-health-sources')).getByText('3')).toBeInTheDocument();
    expect(health).toBeInTheDocument();
  });

  test('renders level groups in defaults order with a trailing Unassigned group', () => {
    render(<ProjectEditor />);
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByTestId('project-tile-exec')).toBeInTheDocument();
    expect(screen.getByTestId('project-tile-orphan')).toBeInTheDocument();
  });

  test('renders the recent-edits feed', () => {
    render(<ProjectEditor />);
    expect(screen.getByTestId('project-editor-recent')).toBeInTheDocument();
    expect(screen.getByTestId('project-editor-recent-exec')).toBeInTheDocument();
  });

  test('clicking a tile dispatches a dashboard selection + telemetry', () => {
    const openWorkspaceTab = jest.fn();
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      seed({ openWorkspaceTab });
      render(<ProjectEditor />);
      fireEvent.click(screen.getByTestId('project-tile-exec'));
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'dashboard:exec',
        type: 'dashboard',
        name: 'exec',
      });
      const pe = events.filter(e => e.eventName === 'project_editor_action');
      expect(pe.some(e => e.payload.kind === 'select_tile' && e.payload.name === 'exec')).toBe(true);
    } finally {
      unsub();
    }
  });

  test('clicking whitespace dispatches a project chrome selection + telemetry', () => {
    const openWorkspaceTab = jest.fn();
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      seed({ openWorkspaceTab });
      render(<ProjectEditor />);
      fireEvent.click(screen.getByTestId('project-editor'));
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'project:analytics-platform',
        type: 'project',
        name: 'analytics-platform',
      });
      const pe = events.filter(e => e.eventName === 'project_editor_action');
      expect(pe.some(e => e.payload.kind === 'select_chrome')).toBe(true);
    } finally {
      unsub();
    }
  });

  test('search field is hidden at or below five dashboards', () => {
    render(<ProjectEditor />);
    expect(screen.queryByTestId('project-editor-search')).not.toBeInTheDocument();
  });

  test('search field appears once the project has more than five dashboards', () => {
    seed({
      dashboards: [
        makeDashboard('a', 'Organization'),
        makeDashboard('b', 'Organization'),
        makeDashboard('c', 'Organization'),
        makeDashboard('d', 'Organization'),
        makeDashboard('e', 'Organization'),
        makeDashboard('zebra', 'Organization'),
      ],
    });
    render(<ProjectEditor />);
    const input = screen.getByTestId('project-editor-search');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'zebra' } });
    expect(screen.getByTestId('project-tile-zebra')).toBeInTheDocument();
    expect(screen.queryByTestId('project-tile-a')).not.toBeInTheDocument();
  });

  test('+ New Dashboard creates a draft dashboard and opens it as a workspace tab', async () => {
    const createDashboard = jest.fn().mockResolvedValue({ success: true, name: 'new-dashboard' });
    const openWorkspaceTab = jest.fn();
    seed({ createDashboard, openWorkspaceTab });
    render(<ProjectEditor />);
    const cta = screen.getByTestId('project-editor-new-dashboard');
    expect(cta).toHaveTextContent('New Dashboard');
    fireEvent.click(cta);
    await waitFor(() => expect(createDashboard).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'dashboard:new-dashboard',
      type: 'dashboard',
        name: 'new-dashboard',
      })
    );
  });

  test('a failed create does not open a tab', async () => {
    const createDashboard = jest.fn().mockResolvedValue({ success: false, error: 'boom' });
    const openWorkspaceTab = jest.fn();
    seed({ createDashboard, openWorkspaceTab });
    render(<ProjectEditor />);
    fireEvent.click(screen.getByTestId('project-editor-new-dashboard'));
    await waitFor(() => expect(createDashboard).toHaveBeenCalledTimes(1));
    expect(openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('renders the empty state when there are no dashboards', () => {
    seed({ dashboards: [] });
    render(<ProjectEditor />);
    expect(screen.getByTestId('project-editor-empty')).toBeInTheDocument();
    expect(screen.getByText('Create your first dashboard')).toBeInTheDocument();
  });

  test('highlights the tile matching the active dashboard selection', () => {
    seed({ workspaceActiveObject: { type: 'dashboard', name: 'sales' } });
    render(<ProjectEditor />);
    expect(screen.getByTestId('project-tile-sales')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('project-tile-exec')).toHaveAttribute('data-selected', 'false');
  });

  // --- VIS-807 M-2a: inline level affordances + Add level ---------------------

  test('+ Add level row invokes createLevel + telemetry', () => {
    const createLevel = jest.fn();
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      seed({ createLevel });
      render(<ProjectEditor />);
      fireEvent.click(screen.getByTestId('project-editor-add-level'));
      expect(createLevel).toHaveBeenCalledTimes(1);
      expect(
        events.some(
          e => e.eventName === 'project_editor_action' && e.payload.kind === 'level_create'
        )
      ).toBe(true);
    } finally {
      unsub();
    }
  });

  test('inline rename of a configured level invokes renameLevel + telemetry', () => {
    const renameLevel = jest.fn();
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      seed({ renameLevel });
      render(<ProjectEditor />);
      const title = screen.getByTestId('level-group-header-level:0-title');
      fireEvent.doubleClick(title);
      const input = screen.getByTestId('level-group-header-level:0-rename-input');
      fireEvent.change(input, { target: { value: 'Company' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(renameLevel).toHaveBeenCalledWith(0, 'Company');
      expect(
        events.some(
          e => e.eventName === 'project_editor_action' && e.payload.kind === 'level_rename'
        )
      ).toBe(true);
    } finally {
      unsub();
    }
  });

  test('reorder down invokes reorderLevel + telemetry', () => {
    const reorderLevel = jest.fn();
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      seed({ reorderLevel });
      render(<ProjectEditor />);
      fireEvent.click(screen.getByTestId('level-group-header-level:0-move-down'));
      expect(reorderLevel).toHaveBeenCalledWith(0, 1);
      expect(
        events.some(
          e => e.eventName === 'project_editor_action' && e.payload.kind === 'level_reorder'
        )
      ).toBe(true);
    } finally {
      unsub();
    }
  });

  test('delete-with-confirm invokes deleteLevel + telemetry', () => {
    const deleteLevel = jest.fn();
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      seed({ deleteLevel });
      render(<ProjectEditor />);
      fireEvent.click(screen.getByTestId('level-group-header-level:0-delete'));
      expect(deleteLevel).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('level-group-header-level:0-delete-confirm-btn'));
      expect(deleteLevel).toHaveBeenCalledWith(0);
      expect(
        events.some(
          e => e.eventName === 'project_editor_action' && e.payload.kind === 'level_delete'
        )
      ).toBe(true);
    } finally {
      unsub();
    }
  });

  test('the Unassigned group is not editable (no affordances)', () => {
    render(<ProjectEditor />);
    expect(
      screen.queryByTestId('level-group-header-__unassigned__-actions')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('level-group-header-__unassigned__-delete')
    ).not.toBeInTheDocument();
  });

  // --- VIS-1013: project-level governance surface ----------------------------

  test('renders the governance section with the relations + fields lists and counts', () => {
    render(<ProjectEditor />);
    expect(screen.getByTestId('project-governance')).toBeInTheDocument();
    expect(screen.getByTestId('project-relations-list')).toBeInTheDocument();
    expect(screen.getByTestId('project-fields-list')).toBeInTheDocument();
    // counts: 1 relation, 2 fields (1 metric + 1 dimension)
    expect(screen.getByTestId('project-governance-relations-count')).toHaveTextContent('1');
    expect(screen.getByTestId('project-governance-fields-count')).toHaveTextContent('2');
    // rows for the seeded objects
    expect(screen.getByTestId('project-relations-row-local_to_local')).toBeInTheDocument();
    expect(screen.getByTestId('project-fields-row-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('project-fields-row-region')).toBeInTheDocument();
  });

  test('clicking a relation row opens its per-object editor tab + telemetry', () => {
    const openWorkspaceTab = jest.fn();
    const events = [];
    const unsub = setWorkspaceTelemetryListener(e => events.push(e));
    try {
      seed({ openWorkspaceTab });
      render(<ProjectEditor />);
      fireEvent.click(screen.getByTestId('project-relations-row-local_to_local'));
      expect(openWorkspaceTab).toHaveBeenCalledWith({
        id: 'relation:local_to_local',
        type: 'relation',
        name: 'local_to_local',
      });
      expect(
        events.some(
          e =>
            e.eventName === 'project_editor_action' &&
            e.payload.kind === 'open_governance_object' &&
            e.payload.type === 'relation' &&
            e.payload.name === 'local_to_local'
        )
      ).toBe(true);
    } finally {
      unsub();
    }
  });

  test('clicking a metric row opens its per-object editor tab', () => {
    const openWorkspaceTab = jest.fn();
    seed({ openWorkspaceTab });
    render(<ProjectEditor />);
    fireEvent.click(screen.getByTestId('project-fields-row-revenue'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'metric:revenue',
      type: 'metric',
      name: 'revenue',
    });
  });

  test('clicking a dimension row opens its per-object editor tab', () => {
    const openWorkspaceTab = jest.fn();
    seed({ openWorkspaceTab });
    render(<ProjectEditor />);
    fireEvent.click(screen.getByTestId('project-fields-row-region'));
    expect(openWorkspaceTab).toHaveBeenCalledWith({
      id: 'dimension:region',
      type: 'dimension',
      name: 'region',
    });
  });

  test('fetches governance collections on mount when empty', () => {
    const fetchRelations = jest.fn();
    const fetchMetrics = jest.fn();
    const fetchDimensions = jest.fn();
    seed({ relations: [], metrics: [], dimensions: [], fetchRelations, fetchMetrics, fetchDimensions });
    render(<ProjectEditor />);
    expect(fetchRelations).toHaveBeenCalledTimes(1);
    expect(fetchMetrics).toHaveBeenCalledTimes(1);
    expect(fetchDimensions).toHaveBeenCalledTimes(1);
  });

  test('shows governance empty states when no relations or fields exist', () => {
    seed({ relations: [], metrics: [], dimensions: [] });
    render(<ProjectEditor />);
    expect(screen.getByTestId('project-relations-list')).toHaveTextContent(/No relations defined/i);
    expect(screen.getByTestId('project-fields-list')).toHaveTextContent(/No semantic fields/i);
    expect(screen.getByTestId('project-governance-relations-count')).toHaveTextContent('0');
    expect(screen.getByTestId('project-governance-fields-count')).toHaveTextContent('0');
  });
});
