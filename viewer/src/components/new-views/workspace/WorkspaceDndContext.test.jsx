/**
 * WorkspaceDndContext tests (VIS-802 / Track G G-1).
 *
 * Two responsibilities:
 *   1. The shared <DndContext> wraps children + provides the live drag via
 *      useWorkspaceDrag() (initially null).
 *   2. routeWorkspaceDragEnd — the pure router that decides what a finished
 *      drag means. This SUBSUMES ProjectEditor's old onDragEnd (dashboard tile
 *      → level reassignment) AND adds Library-row → RefDropZone writes. dnd-kit
 *      pointer drags can't run in jsdom, so we unit-test the router directly;
 *      the real drag is exercised by the Playwright stories.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import WorkspaceDndContext, {
  useWorkspaceDrag,
  routeWorkspaceDragEnd,
} from './WorkspaceDndContext';
import useStore from '../../../stores/store';

const DASHBOARDS = [
  { name: 'd0', config: { level: 'Organization' } },
  { name: 'd1', config: { level: 'Department' } },
];

const DragProbe = () => {
  const drag = useWorkspaceDrag();
  return <div data-testid="drag-probe">{drag ? drag.kind : 'null'}</div>;
};

beforeEach(() => {
  useStore.setState({
    dashboards: DASHBOARDS,
    defaults: { levels: [{ title: 'Organization' }, { title: 'Department' }] },
    project: {},
    reassignDashboardLevel: jest.fn(() => Promise.resolve({ success: true })),
  });
});

describe('WorkspaceDndContext provider (VIS-802)', () => {
  test('renders children and provides a null drag initially', () => {
    render(
      <WorkspaceDndContext>
        <DragProbe />
      </WorkspaceDndContext>
    );
    expect(screen.getByTestId('drag-probe')).toHaveTextContent('null');
  });
});

describe('routeWorkspaceDragEnd (VIS-802)', () => {
  const defaults = { levels: [{ title: 'Organization' }, { title: 'Department' }] };

  test('returns noop when there is no drop target', () => {
    const result = routeWorkspaceDragEnd(
      { active: { data: { current: { type: 'dashboard', name: 'd0' } } }, over: null },
      { dashboards: DASHBOARDS, projectDefaults: defaults }
    );
    expect(result).toBe('noop');
  });

  test('dashboard tile drop → reassigns the level (M-1, now routed here)', () => {
    const reassignDashboardLevel = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { type: 'dashboard', name: 'd0', level: 'Organization' } } },
        over: { data: { current: { levelKey: 'level:1', levelValue: 'Department' } } },
      },
      { dashboards: DASHBOARDS, projectDefaults: defaults, reassignDashboardLevel, emit }
    );
    expect(result).toBe('reassign_level');
    expect(reassignDashboardLevel).toHaveBeenCalledWith('d0', 'Department');
    expect(emit).toHaveBeenCalledWith(
      'project_editor_action',
      expect.objectContaining({ kind: 'reassign_level', name: 'd0', level: 'Department' })
    );
  });

  test('library row drop on a matching ref-slot → writes the ref', () => {
    const onChange = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'chart', name: 'c1' } } },
        over: {
          data: {
            current: {
              kind: 'ref-slot',
              refId: 'row-0-item-0',
              allowedTypes: ['chart', 'table', 'markdown', 'input'],
              onChange,
            },
          },
        },
      },
      { emit }
    );
    expect(result).toBe('ref_accepted');
    expect(onChange).toHaveBeenCalledWith({ type: 'chart', name: 'c1' });
    expect(emit).toHaveBeenCalledWith(
      'ref_dropzone_drop',
      expect.objectContaining({ type: 'chart', name: 'c1', accepted: true })
    );
  });

  test('library row drop with a type-mismatch is rejected (no write)', () => {
    const onChange = jest.fn();
    const emit = jest.fn();
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'source', name: 's1' } } },
        over: {
          data: {
            current: {
              kind: 'ref-slot',
              refId: 'row-0-item-0',
              allowedTypes: ['chart', 'table', 'markdown', 'input'],
              onChange,
            },
          },
        },
      },
      { emit }
    );
    expect(result).toBe('ref_rejected');
    expect(onChange).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      'ref_dropzone_drop',
      expect.objectContaining({ type: 'source', accepted: false })
    );
  });

  test('library row drop on a non-ref-slot target is a noop', () => {
    const result = routeWorkspaceDragEnd(
      {
        active: { data: { current: { source: 'library', type: 'chart', name: 'c1' } } },
        over: { data: { current: { kind: 'something-else' } } },
      },
      {}
    );
    expect(result).toBe('noop');
  });
});
