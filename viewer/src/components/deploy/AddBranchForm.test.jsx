import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddBranchForm from './AddBranchForm';

// Mock Loading component
jest.mock('../common/Loading', () => () => <div data-testid="loading-spinner" />);

describe('AddBranchForm', () => {
  const mockBranches = [{ name: 'production' }, { name: 'staging' }];
  const mockSetBranches = jest.fn();
  const mockSetSelectedBranch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input and buttons correctly', () => {
    render(
      <AddBranchForm
        branches={mockBranches}
        setBranches={mockSetBranches}
        setSelectedBranch={mockSetSelectedBranch}
      />
    );

    expect(screen.getByText('Add New Branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch Name')).toBeInTheDocument();
    expect(screen.getByText('Create Branch')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows error if branch name already exists', async () => {
    render(
      <AddBranchForm
        branches={mockBranches}
        setBranches={mockSetBranches}
        setSelectedBranch={mockSetSelectedBranch}
      />
    );

    fireEvent.change(screen.getByLabelText(/Branch Name/i), {
      target: { value: 'Production' },
    });

    fireEvent.click(screen.getByText('Create Branch'));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it('submits form and updates branch list on success', async () => {
    const newBranch = { name: 'development' };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ branch: newBranch }),
      })
    );

    render(
      <AddBranchForm
        branches={mockBranches}
        setBranches={mockSetBranches}
        setSelectedBranch={mockSetSelectedBranch}
      />
    );

    fireEvent.change(screen.getByLabelText(/Branch Name/i), {
      target: { value: 'development' },
    });

    fireEvent.click(screen.getByText('Create Branch'));

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockSetBranches).toHaveBeenCalled();
    });

    const setBranchesFn = mockSetBranches.mock.calls[0][0];
    const result = setBranchesFn(mockBranches);
    expect(result).toEqual([...mockBranches, newBranch]);

    expect(mockSetSelectedBranch).toHaveBeenCalledWith('development');

    global.fetch.mockRestore();
  });

  it('shows error message on failed request', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      })
    );

    render(
      <AddBranchForm
        branches={mockBranches}
        setBranches={mockSetBranches}
        setSelectedBranch={mockSetSelectedBranch}
      />
    );

    fireEvent.change(screen.getByLabelText(/Branch Name/i), {
      target: { value: 'qa' },
    });

    fireEvent.click(screen.getByText('Create Branch'));

    expect(await screen.findByText(/Failed to create branch/i)).toBeInTheDocument();

    global.fetch.mockRestore();
  });

  it('shows error if fetch throws an exception', async () => {
    global.fetch = jest.fn(() => Promise.reject('API is down'));

    render(
      <AddBranchForm
        branches={mockBranches}
        setBranches={mockSetBranches}
        setSelectedBranch={mockSetSelectedBranch}
      />
    );

    fireEvent.change(screen.getByLabelText(/Branch Name/i), {
      target: { value: 'qa' },
    });

    fireEvent.click(screen.getByText('Create Branch'));

    expect(await screen.findByText(/Failed to create branch/i)).toBeInTheDocument();

    global.fetch.mockRestore();
  });

  it('resets input and error on cancel', () => {
    render(
      <AddBranchForm
        branches={mockBranches}
        setBranches={mockSetBranches}
        setSelectedBranch={mockSetSelectedBranch}
      />
    );

    const input = screen.getByLabelText(/Branch Name/i);
    fireEvent.change(input, { target: { value: 'temporary' } });

    expect(input.value).toBe('temporary');

    fireEvent.click(screen.getByText('Cancel'));

    expect(input.value).toBe('');
  });
});
