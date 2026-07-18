import React from 'react';
import { render, screen, act } from '@testing-library/react';
import WorkspaceToast from './WorkspaceToast';
import useStore from '../../../stores/store';

describe('WorkspaceToast', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({ workspaceToast: null });
    });
  });

  test('renders nothing (Snackbar closed) when there is no toast', () => {
    render(<WorkspaceToast />);
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  test('shows the message when workspaceToast is set', () => {
    act(() => {
      useStore.getState().showWorkspaceToast('Churn dig was deleted');
    });
    render(<WorkspaceToast />);
    expect(screen.getByText('Churn dig was deleted')).toBeInTheDocument();
  });

  test('dismissing clears workspaceToast', () => {
    act(() => {
      useStore.getState().showWorkspaceToast('Churn dig was deleted');
    });
    render(<WorkspaceToast />);
    act(() => {
      useStore.getState().dismissWorkspaceToast();
    });
    expect(useStore.getState().workspaceToast).toBeNull();
  });
});
