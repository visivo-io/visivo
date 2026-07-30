/**
 * ViewSwitcher (D1, Explore 2.0 Phase 0).
 *
 * The destination switcher pinned atop the LeftRail — replaces the old
 * `library-surface-*` buttons (previously tested in `library/Library.test.jsx`).
 * Covers: three rows in registry order, the active indicator (only lit while
 * NO document tab owns the center — 01-ux-spec.md §1), click routing through
 * `openWorkspaceView`, and the collapsed icon-strip variant.
 */
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import ViewSwitcher from './ViewSwitcher';
import useStore from '../../../stores/store';
import { setWorkspaceTelemetryListener } from './telemetry';

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceActiveView: 'project',
      workspaceActiveTabId: null,
      openWorkspaceView: jest.fn(),
      ...extra,
    });
  });
};

describe('ViewSwitcher (expanded)', () => {
  test('renders the three destinations in registry order with icon + label', () => {
    seed();
    render(<ViewSwitcher />);
    const nav = screen.getByTestId('workspace-view-switcher');
    expect(nav).toHaveAttribute('data-collapsed', 'false');
    const buttons = [
      screen.getByTestId('workspace-view-switcher-project'),
      screen.getByTestId('workspace-view-switcher-semantic-layer'),
      screen.getByTestId('workspace-view-switcher-explorer'),
    ];
    expect(buttons[0]).toHaveTextContent('Project');
    expect(buttons[1]).toHaveTextContent('Semantic Layer');
    expect(buttons[2]).toHaveTextContent('Explorer');
    // DOM order matches the registry (Project, Semantic Layer, Explorer).
    const rendered = within(nav).getAllByRole('button');
    expect(rendered[0]).toBe(buttons[0]);
    expect(rendered[1]).toBe(buttons[1]);
    expect(rendered[2]).toBe(buttons[2]);
  });

  test('the active view carries the active indicator when no document tab is focused', () => {
    seed({ workspaceActiveView: 'semantic-layer', workspaceActiveTabId: null });
    render(<ViewSwitcher />);
    expect(screen.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  test('NO view shows active while a document tab owns the center (01-ux-spec.md §1)', () => {
    // A document tab is focused (workspaceActiveTabId set) even though
    // workspaceActiveView still remembers the owning destination — the
    // switcher must show no active row while a tab has the center.
    seed({ workspaceActiveView: 'project', workspaceActiveTabId: 'chart:revenue' });
    render(<ViewSwitcher />);
    expect(screen.getByTestId('workspace-view-switcher-project')).toHaveAttribute(
      'data-active',
      'false'
    );
    expect(screen.getByTestId('workspace-view-switcher-semantic-layer')).toHaveAttribute(
      'data-active',
      'false'
    );
    expect(screen.getByTestId('workspace-view-switcher-explorer')).toHaveAttribute(
      'data-active',
      'false'
    );
  });

  test('clicking a row calls openWorkspaceView with that view key and fires telemetry', () => {
    const openWorkspaceView = jest.fn();
    seed({ openWorkspaceView });
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(evt => events.push(evt));
    try {
      render(<ViewSwitcher />);
      fireEvent.click(screen.getByTestId('workspace-view-switcher-explorer'));
      expect(openWorkspaceView).toHaveBeenCalledWith('explorer');
      const fired = events.filter(e => e.eventName === 'view_switcher_selected');
      expect(fired).toHaveLength(1);
      expect(fired[0].payload).toEqual({ view: 'explorer' });
    } finally {
      unsubscribe();
    }
  });

  test('views have no close (✕) affordance — they are not tab records', () => {
    seed();
    render(<ViewSwitcher />);
    const nav = screen.getByTestId('workspace-view-switcher');
    expect(within(nav).queryAllByLabelText(/close/i)).toHaveLength(0);
  });
});

describe('ViewSwitcher (collapsed)', () => {
  test('renders a fixed-position icon strip with tooltips instead of labels', () => {
    seed({ workspaceActiveView: 'explorer', workspaceActiveTabId: null });
    render(<ViewSwitcher collapsed />);
    const nav = screen.getByTestId('workspace-view-switcher');
    expect(nav).toHaveAttribute('data-collapsed', 'true');
    const explorerBtn = screen.getByTestId('workspace-view-switcher-explorer');
    expect(explorerBtn).toHaveAttribute('title', 'Explorer');
    expect(explorerBtn).toHaveAttribute('aria-label', 'Explorer');
    expect(explorerBtn).not.toHaveTextContent('Explorer');
    expect(explorerBtn).toHaveAttribute('data-active', 'true');
  });

  test('clicking a collapsed icon still activates the view', () => {
    const openWorkspaceView = jest.fn();
    seed({ openWorkspaceView });
    render(<ViewSwitcher collapsed />);
    fireEvent.click(screen.getByTestId('workspace-view-switcher-semantic-layer'));
    expect(openWorkspaceView).toHaveBeenCalledWith('semantic-layer');
  });
});
