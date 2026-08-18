import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CommitModal from './CommitModal';

// useStore is selector-based: each call is useStore(state => state.x). The mock
// applies the selector to a mutable module-level state so each test can drive it.
let mockState;
jest.mock('../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
  default: selector => selector(mockState),
}));
jest.mock('../views/common/objectTypeConfigs', () => ({
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
  discardChanges: jest.fn().mockResolvedValue({ success: true }),
  discardLoading: false,
  restoreDeleted: jest.fn().mockResolvedValue({ success: true }),
  // null = local serve (capabilities probe 404s); an object = cloud.
  capabilities: null,
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

  it('Discard is disabled when there are no pending changes', () => {
    render(<CommitModal />);
    expect(screen.getByTestId('commit-modal-discard')).toBeDisabled();
  });

  it('hides Discard on cloud (capabilities present) — no cloud discard endpoint exists', () => {
    mockState.capabilities = { can_edit: true, can_branch: true };
    mockState.pendingChanges = [{ name: 'a', type: 'chart', status: 'NEW' }];
    render(<CommitModal />);
    expect(screen.queryByTestId('commit-modal-discard')).not.toBeInTheDocument();
  });

  it('Discard confirms inline, then drops the draft cache and closes (Q14)', async () => {
    mockState.pendingChanges = [
      { type: 'model', name: 'orders', status: 'NEW' },
      { type: 'chart', name: 'rev', status: 'MODIFIED' },
    ];
    render(<CommitModal />);

    // First click reveals the inline confirm — no discard yet.
    fireEvent.click(screen.getByTestId('commit-modal-discard'));
    expect(screen.getByTestId('commit-modal-discard-confirm')).toHaveTextContent(
      'Discard all 2 changes?'
    );
    expect(mockState.discardChanges).not.toHaveBeenCalled();

    // Keep backs out without discarding.
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByTestId('commit-modal-discard-confirm')).not.toBeInTheDocument();
    expect(mockState.discardChanges).not.toHaveBeenCalled();

    // Re-open and confirm → discardChanges fires and the modal closes.
    fireEvent.click(screen.getByTestId('commit-modal-discard'));
    fireEvent.click(screen.getByTestId('commit-modal-discard-confirm-button'));
    await waitFor(() => expect(mockState.discardChanges).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockState.closeCommitModal).toHaveBeenCalled());
  });
});


describe('Undo on a pending deletion (VIS-1234)', () => {
  const deletion = { type: 'model', name: 'orders', status: 'DELETED' };
  const edit = { type: 'chart', name: 'revenue', status: 'MODIFIED' };

  test('a deletion offers Undo', () => {
    mockState.pendingChanges = [deletion];
    render(<CommitModal />);

    expect(screen.getByTestId('commit-modal-restore-model-orders')).toBeInTheDocument();
  });

  test('a new or modified change does not', () => {
    // Those are recovered by editing them back; only a deletion is unreachable
    // once it leaves the Library.
    mockState.pendingChanges = [edit];
    render(<CommitModal />);

    expect(screen.queryByTestId('commit-modal-restore-chart-revenue')).toBeNull();
  });

  test('Undo restores that object alone', async () => {
    mockState.pendingChanges = [deletion, edit];
    render(<CommitModal />);

    fireEvent.click(screen.getByTestId('commit-modal-restore-model-orders'));

    await waitFor(() =>
      expect(mockState.restoreDeleted).toHaveBeenCalledWith('model', 'orders')
    );
    expect(mockState.restoreDeleted).toHaveBeenCalledTimes(1);
  });

  test('only the row being restored shows its pending state', async () => {
    const second = { type: 'source', name: 'db', status: 'DELETED' };
    let resolve;
    mockState.restoreDeleted = jest.fn(() => new Promise(r => { resolve = r; }));
    mockState.pendingChanges = [deletion, second];
    render(<CommitModal />);

    fireEvent.click(screen.getByTestId('commit-modal-restore-model-orders'));

    await waitFor(() =>
      expect(screen.getByTestId('commit-modal-restore-model-orders')).toHaveTextContent(
        'Restoring…'
      )
    );
    expect(screen.getByTestId('commit-modal-restore-source-db')).toHaveTextContent('Undo');

    // Settle inside act so the unmount doesn't race the state update.
    await act(async () => {
      resolve({ success: true });
    });
  });
});
