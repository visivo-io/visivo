import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BranchingControls from './BranchingControls';
import useStore from '../../stores/store';

jest.mock('../../stores/store');

const mockStore = (overrides = {}) => {
  const state = {
    capabilities: { can_edit: true, can_branch: true, edit_action: 'edit', is_draft: false },
    startEdit: jest.fn().mockResolvedValue({ success: true }),
    startBranch: jest.fn().mockResolvedValue({ success: true }),
    project: { id: 'proj-1', name: 'p', stage: 'prod' },
    ...overrides,
  };
  useStore.mockImplementation(selector => selector(state));
  return state;
};

describe('BranchingControls', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders nothing until capabilities load', () => {
    mockStore({ capabilities: null });
    render(<BranchingControls />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Branch')).not.toBeInTheDocument();
  });

  it('renders nothing for a pure viewer (no edit, no branch)', () => {
    mockStore({ capabilities: { can_edit: false, can_branch: false, is_draft: false } });
    render(<BranchingControls />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Branch')).not.toBeInTheDocument();
  });

  it('renders nothing when already on a draft (you are editing — use Commit)', () => {
    mockStore({ capabilities: { can_edit: true, can_branch: true, is_draft: true } });
    render(<BranchingControls />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Branch')).not.toBeInTheDocument();
  });

  it('shows Branch only for an editor on the default stage', () => {
    mockStore({
      capabilities: { can_edit: false, can_branch: true, edit_action: 'branch_required' },
    });
    render(<BranchingControls />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
  });

  it('shows both Edit and Branch for a maintainer', () => {
    mockStore();
    render(<BranchingControls />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Branch')).toBeInTheDocument();
  });

  it('clicking Edit calls startEdit', async () => {
    const state = mockStore();
    render(<BranchingControls />);
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => expect(state.startEdit).toHaveBeenCalled());
  });
});
