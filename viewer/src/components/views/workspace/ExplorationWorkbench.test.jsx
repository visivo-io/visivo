/**
 * ExplorationWorkbench — the exploration CENTER pane (CenterPanel alone),
 * re-parented for `ExplorationPane` (Explore 2.0 Phase 2 origin; Phase 3a's
 * DnD unification + Phase 3b's Build-rail rebuild both landed here since —
 * see the component's own docstring for what was retired at the cutover:
 * `ExplorerLeftPanel`/`SourceBrowser`/`ExplorerDndContext`/
 * `ExplorerRightPanel`/`ModelTabBar`). As of 6c-T2 (D6 — the two-rails fix),
 * `ExplorationBuildRail` no longer mounts here at all — it moved to the
 * shell's single `<RightRail>` (see `RightRail.test.jsx`'s exploration-scope
 * coverage for that half).
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

  test('renders CenterPanel alone — NO in-pane build rail, NO nested DnD context, NO ExplorerLeftPanel', () => {
    render(<ExplorationWorkbench />);
    expect(screen.getByTestId('exploration-workbench')).toBeInTheDocument();
    expect(screen.getByTestId('center-panel')).toBeInTheDocument();
    // D6 (6c-T2) — this is the two-rails regression test: ExplorationBuildRail
    // must NEVER mount here again. It lives exclusively in RightRail now.
    expect(screen.queryByTestId('exploration-build-rail')).not.toBeInTheDocument();
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
