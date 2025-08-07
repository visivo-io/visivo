import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddStageForm from './AddStageForm';

// Mock Loading component
jest.mock('../common/Loading', () => () => <div data-testid="loading-spinner" />);

describe('AddStageForm', () => {
  const mockStages = [{ name: 'production' }, { name: 'staging' }];
  const mockSetStages = jest.fn();
  const mockSetSelectedStage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input and buttons correctly', () => {
    render(
      <AddStageForm
        stages={mockStages}
        setStages={mockSetStages}
        setSelectedStage={mockSetSelectedStage}
      />
    );

    expect(screen.getByText('Add New Stage')).toBeInTheDocument();
    expect(screen.getByLabelText('Stage Name')).toBeInTheDocument();
    expect(screen.getByText('Create Stage')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows error if stage name already exists', async () => {
    render(
      <AddStageForm
        stages={mockStages}
        setStages={mockSetStages}
        setSelectedStage={mockSetSelectedStage}
      />
    );

    fireEvent.change(screen.getByLabelText(/Stage Name/i), {
      target: { value: 'Production' },
    });

    fireEvent.click(screen.getByText('Create Stage'));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it('submits form and updates stage list on success', async () => {
    const newStage = { name: 'development' };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ stage: newStage }),
      })
    );

    render(
      <AddStageForm
        stages={mockStages}
        setStages={mockSetStages}
        setSelectedStage={mockSetSelectedStage}
      />
    );

    fireEvent.change(screen.getByLabelText(/Stage Name/i), {
      target: { value: 'development' },
    });

    fireEvent.click(screen.getByText('Create Stage'));

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockSetStages).toHaveBeenCalled();
    });

    const setStagesFn = mockSetStages.mock.calls[0][0];
    const result = setStagesFn(mockStages);
    expect(result).toEqual([...mockStages, newStage]);

    expect(mockSetSelectedStage).toHaveBeenCalledWith('development');

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
      <AddStageForm
        stages={mockStages}
        setStages={mockSetStages}
        setSelectedStage={mockSetSelectedStage}
      />
    );

    fireEvent.change(screen.getByLabelText(/Stage Name/i), {
      target: { value: 'qa' },
    });

    fireEvent.click(screen.getByText('Create Stage'));

    expect(await screen.findByText(/Failed to create stage/i)).toBeInTheDocument();

    global.fetch.mockRestore();
  });

  it('shows error if fetch throws an exception', async () => {
    global.fetch = jest.fn(() => Promise.reject('API is down'));

    render(
      <AddStageForm
        stages={mockStages}
        setStages={mockSetStages}
        setSelectedStage={mockSetSelectedStage}
      />
    );

    fireEvent.change(screen.getByLabelText(/Stage Name/i), {
      target: { value: 'qa' },
    });

    fireEvent.click(screen.getByText('Create Stage'));

    expect(await screen.findByText(/Failed to create stage/i)).toBeInTheDocument();

    global.fetch.mockRestore();
  });

  it('resets input and error on cancel', () => {
    render(
      <AddStageForm
        stages={mockStages}
        setStages={mockSetStages}
        setSelectedStage={mockSetSelectedStage}
      />
    );

    const input = screen.getByLabelText(/Stage Name/i);
    fireEvent.change(input, { target: { value: 'temporary' } });

    expect(input.value).toBe('temporary');

    fireEvent.click(screen.getByText('Cancel'));

    expect(input.value).toBe('');
  });
});
