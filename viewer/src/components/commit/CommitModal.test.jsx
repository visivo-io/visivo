import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommitModal from './CommitModal';

// useStore is selector-based: each call is useStore(state => state.x). The mock
// applies the selector to a mutable module-level state so each test can drive it.
let mockState;
jest.mock('../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
  default: selector => selector(mockState),
}));
jest.mock('../new-views/common/objectTypeConfigs', () => ({
  getTypeByValue: type => ({
    singularLabel: type,
    colors: { bg: 'bg-x', text: 'text-x' },
    icon: null,
  }),
}));

const baseState = () => ({
  commitModalOpen: true,
  closeCommitModal: jest.fn(),
  pendingChanges: [],
  commitLoading: false,
  commitError: null,
  commitChanges: jest.fn().mockResolvedValue({ success: true }),
});

beforeEach(() => {
  mockState = baseState();
});

describe('CommitModal', () => {
  it('renders nothing when the modal is closed', () => {
    mockState.commitModalOpen = false;
    const { container } = render(<CommitModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty state and disables Commit when there are no pending changes', () => {
    render(<CommitModal />);
    expect(screen.getByText('No pending changes to commit.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit Changes' })).toBeDisabled();
  });

  it('lists pending changes with type and status badges', () => {
    mockState.pendingChanges = [
      { type: 'source', name: 'pg', status: 'NEW', source_type: 'postgresql' },
      { type: 'model', name: 'orders', status: 'MODIFIED' },
    ];
    render(<CommitModal />);
    expect(screen.getByText('pg')).toBeInTheDocument();
    expect(screen.getByText('(postgresql)')).toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();
    expect(screen.getByText('MODIFIED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit Changes' })).toBeEnabled();
  });

  it('surfaces a commit error', () => {
    mockState.commitError = 'write failed';
    render(<CommitModal />);
    expect(screen.getByText('write failed')).toBeInTheDocument();
  });

  it('commits on click and closes via Cancel', async () => {
    mockState.pendingChanges = [{ type: 'model', name: 'orders', status: 'NEW' }];
    render(<CommitModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Commit Changes' }));
    await waitFor(() => expect(mockState.commitChanges).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockState.closeCommitModal).toHaveBeenCalled();
  });

  it('reflects the in-flight committing state', () => {
    mockState.commitLoading = true;
    mockState.pendingChanges = [{ type: 'model', name: 'orders', status: 'NEW' }];
    render(<CommitModal />);
    const button = screen.getByRole('button', { name: 'Committing...' });
    expect(button).toBeDisabled();
  });
});
