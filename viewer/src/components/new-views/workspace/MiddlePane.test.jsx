/**
 * MiddlePane dispatcher (VIS-775 + VIS-805).
 *
 * Confirms the project pane now mounts the real `<ProjectEditor>` surface
 * (M-1) instead of the "coming soon" placeholder, and that the other variants
 * still resolve. ProjectEditor + DashboardNew are mocked so this stays a
 * focused dispatcher test.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import MiddlePane from './MiddlePane';
import useStore from '../../../stores/store';

jest.mock('../project/editor/ProjectEditor', () => () => (
  <div data-testid="mock-project-editor" />
));
jest.mock('../project/DashboardNew', () => () => <div data-testid="mock-dashboard-new" />);

const setActive = activeObject => {
  act(() => {
    useStore.setState({
      workspaceActiveObject: activeObject,
      workspaceLens: 'preview',
      setWorkspaceLens: jest.fn(),
      project: { id: 'p1', name: 'proj' },
    });
  });
};

describe('MiddlePane project variant', () => {
  test('mounts ProjectEditor when no object is scoped (defaults to project)', () => {
    setActive(null);
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-project')).toBeInTheDocument();
    expect(screen.getByTestId('mock-project-editor')).toBeInTheDocument();
    // The old placeholder is gone.
    expect(
      screen.queryByTestId('workspace-middle-project-placeholder')
    ).not.toBeInTheDocument();
  });

  test('mounts ProjectEditor when the active object is the project chrome', () => {
    setActive({ type: 'project', name: 'proj' });
    render(<MiddlePane />);
    expect(screen.getByTestId('mock-project-editor')).toBeInTheDocument();
  });

  test('renders the dashboard pane when a dashboard is scoped', () => {
    setActive({ type: 'dashboard', name: 'simple-dashboard' });
    render(<MiddlePane />);
    expect(screen.getByTestId('workspace-middle-dashboard')).toBeInTheDocument();
  });
});
