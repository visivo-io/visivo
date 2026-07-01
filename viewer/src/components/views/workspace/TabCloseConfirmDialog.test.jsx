/**
 * TabCloseConfirmDialog (VIS-812 / Track O O-3).
 *
 * The dirty-close confirmation. Store-driven: renders only while
 * `workspacePendingCloseTabId` points at an open tab; "Keep editing" cancels,
 * "Close without saving" confirms, Escape + backdrop both cancel.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TabCloseConfirmDialog from './TabCloseConfirmDialog';
import useStore from '../../../stores/store';

const TABS = [
  { id: 'project:p', type: 'project', name: 'p', dirty: false },
  { id: 'chart:revenue', type: 'chart', name: 'revenue', dirty: true },
];

const seed = (extra = {}) => {
  act(() => {
    useStore.setState({
      workspaceTabs: TABS,
      workspacePendingCloseTabId: null,
      confirmCloseWorkspaceTab: jest.fn(),
      cancelCloseWorkspaceTab: jest.fn(),
      ...extra,
    });
  });
};

describe('TabCloseConfirmDialog', () => {
  test('renders nothing without a pending close', () => {
    seed();
    render(<TabCloseConfirmDialog />);
    expect(screen.queryByTestId('tab-close-confirm-dialog')).not.toBeInTheDocument();
  });

  test('renders nothing when the pending id does not match an open tab', () => {
    seed({ workspacePendingCloseTabId: 'chart:gone' });
    render(<TabCloseConfirmDialog />);
    expect(screen.queryByTestId('tab-close-confirm-dialog')).not.toBeInTheDocument();
  });

  test('renders the dialog naming the dirty tab, with focus on the safe action', () => {
    seed({ workspacePendingCloseTabId: 'chart:revenue' });
    render(<TabCloseConfirmDialog />);
    const dialog = screen.getByTestId('tab-close-confirm-dialog');
    expect(dialog).toHaveTextContent('Close tab with unsaved changes?');
    expect(dialog).toHaveTextContent('revenue');
    expect(screen.getByTestId('tab-close-confirm-cancel')).toHaveFocus();
  });

  test('"Close without saving" confirms the close', () => {
    const confirmCloseWorkspaceTab = jest.fn();
    seed({ workspacePendingCloseTabId: 'chart:revenue', confirmCloseWorkspaceTab });
    render(<TabCloseConfirmDialog />);
    fireEvent.click(screen.getByTestId('tab-close-confirm-close'));
    expect(confirmCloseWorkspaceTab).toHaveBeenCalled();
  });

  test('"Keep editing" cancels the close', () => {
    const cancelCloseWorkspaceTab = jest.fn();
    seed({ workspacePendingCloseTabId: 'chart:revenue', cancelCloseWorkspaceTab });
    render(<TabCloseConfirmDialog />);
    fireEvent.click(screen.getByTestId('tab-close-confirm-cancel'));
    expect(cancelCloseWorkspaceTab).toHaveBeenCalled();
  });

  test('Escape cancels the close', () => {
    const cancelCloseWorkspaceTab = jest.fn();
    seed({ workspacePendingCloseTabId: 'chart:revenue', cancelCloseWorkspaceTab });
    render(<TabCloseConfirmDialog />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cancelCloseWorkspaceTab).toHaveBeenCalled();
  });

  test('clicking the backdrop cancels; clicking inside the card does not', () => {
    const cancelCloseWorkspaceTab = jest.fn();
    seed({ workspacePendingCloseTabId: 'chart:revenue', cancelCloseWorkspaceTab });
    render(<TabCloseConfirmDialog />);
    fireEvent.pointerDown(screen.getByTestId('tab-close-confirm-dialog'));
    expect(cancelCloseWorkspaceTab).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('tab-close-confirm-backdrop'));
    expect(cancelCloseWorkspaceTab).toHaveBeenCalled();
  });
});
