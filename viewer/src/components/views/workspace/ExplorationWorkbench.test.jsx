/**
 * ExplorationWorkbench — the legacy Explorer bundle re-parented for
 * `ExplorationPane` (Explore 2.0 Phase 2, SURGICALLY REDUCED in Phase 3a —
 * see the component's own docstring for exactly what changed and why
 * `ExplorerLeftPanel`/`ExplorerDndContext` stay alive as files for the
 * still-untouched standalone `/explorer` route).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ExplorationWorkbench from './ExplorationWorkbench';
import useStore from '../../../stores/store';

jest.mock('../../explorer/CenterPanel', () => {
  return function MockCenterPanel({ modelTabBar, enableLibraryDrop }) {
    return (
      <div data-testid="center-panel" data-enable-library-drop={enableLibraryDrop ? 'true' : 'false'}>
        CenterPanel
        {modelTabBar}
      </div>
    );
  };
});
jest.mock('../../explorer/ExplorerRightPanel', () => {
  return function MockExplorerRightPanel() {
    return <div data-testid="right-panel">ExplorerRightPanel</div>;
  };
});
jest.mock('./ExplorationQueryChips', () => {
  return function MockExplorationQueryChips() {
    return <div data-testid="exploration-query-chips-mock">chips</div>;
  };
});

describe('ExplorationWorkbench', () => {
  beforeEach(() => {
    useStore.setState({
      explorerModelTabs: [],
      explorerActiveModelName: null,
      explorerChartInsightNames: [],
      explorerInsightStates: {},
      explorerActiveInsightName: null,
      explorerChartName: null,
      explorerChartLayout: {},
      explorerSources: [],
    });
  });

  test('renders CenterPanel + ExplorerRightPanel — NO nested DnD context, NO ExplorerLeftPanel', () => {
    render(<ExplorationWorkbench />);
    expect(screen.getByTestId('exploration-workbench')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
    // Phase 3a: DnD unifies onto the shell's WorkspaceDndContext — this
    // component no longer wraps a nested one, and the Library (the
    // Workspace's own left rail, not a component this pane mounts) replaces
    // the old ExplorerLeftPanel as the browse surface.
    expect(screen.queryByTestId('dnd-context')).not.toBeInTheDocument();
    expect(screen.queryByTestId('left-panel')).not.toBeInTheDocument();
  });

  test('passes the new query chips as CenterPanel.modelTabBar (replaces ModelTabBar)', () => {
    render(<ExplorationWorkbench />);
    expect(screen.getByTestId('exploration-query-chips-mock')).toBeInTheDocument();
  });

  test('opts CenterPanel into the Library SQL-editor drop target (D9)', () => {
    render(<ExplorationWorkbench />);
    expect(screen.getByTestId('center-panel')).toHaveAttribute('data-enable-library-drop', 'true');
  });

  test('sizes to fill its container (no fixed viewport height, unlike the standalone route)', () => {
    render(<ExplorationWorkbench />);
    const root = screen.getByTestId('exploration-workbench');
    expect(root.className).toContain('flex-1');
    expect(root.className).not.toContain('100vh');
  });
});
