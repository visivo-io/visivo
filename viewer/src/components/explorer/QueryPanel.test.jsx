import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QueryPanel from './QueryPanel';
import useStore from '../../stores/store';

// Mock the NotebookWorksheet component
jest.mock('../notebook/NotebookWorksheet', () => {
  return function MockNotebookWorksheet({ worksheetId }) {
    return <div data-testid="notebook-worksheet">Notebook for {worksheetId}</div>;
  };
});

// Mock the WorksheetTabManager component
jest.mock('../worksheets/WorksheetTabManager', () => {
  return function MockWorksheetTabManager({
    worksheets,
    activeWorksheetId,
    onWorksheetSelect,
    onWorksheetCreate,
    onWorksheetRename,
  }) {
    return (
      <div data-testid="worksheet-tab-manager">
        <button onClick={onWorksheetCreate} data-testid="create-worksheet-btn">
          New Worksheet
        </button>
        {worksheets.map(w => (
          <div key={w.id} data-testid={`worksheet-tab-${w.id}`}>
            <button onClick={() => onWorksheetSelect(w.id)}>{w.name}</button>
            <input
              type="text"
              defaultValue={w.name}
              onBlur={e => onWorksheetRename(w.id, e.target.value)}
              data-testid={`rename-input-${w.id}`}
            />
          </div>
        ))}
        <div data-testid="active-worksheet">{activeWorksheetId}</div>
      </div>
    );
  };
});

// Mock SourceDropdown
jest.mock('./SourceDropdown', () => {
  return function MockSourceDropdown({ selectedSource, onSourceChange }) {
    return (
      <select
        data-testid="source-dropdown"
        value={selectedSource?.name || ''}
        onChange={e => onSourceChange({ name: e.target.value })}
      >
        <option value="">Select Source</option>
        <option value="source1">Source 1</option>
        <option value="source2">Source 2</option>
      </select>
    );
  };
});

// Mock the store
jest.mock('../../stores/store');

describe('QueryPanel', () => {
  const mockStoreState = {
    worksheets: [
      { id: 'ws1', name: 'Worksheet 1', is_visible: true, selected_source: 'source1' },
      { id: 'ws2', name: 'Worksheet 2', is_visible: true, selected_source: 'source2' },
    ],
    activeWorksheetId: 'ws1',
    worksheetsLoading: false,
    worksheetsError: null,
    selectedSource: { name: 'source1' },
    splitRatio: 0.5,
    createNewWorksheet: jest.fn(),
    updateWorksheetData: jest.fn(),
    setActiveWorksheet: jest.fn(),
    setSelectedSource: jest.fn(),
    clearWorksheetError: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useStore.mockImplementation(selector => {
      if (typeof selector === 'function') {
        return selector(mockStoreState);
      }
      return mockStoreState;
    });
  });

  test('renders WorksheetTabManager with visible worksheets', () => {
    render(<QueryPanel />);
    expect(screen.getByTestId('worksheet-tab-manager')).toBeInTheDocument();
    expect(screen.getByText('Worksheet 1')).toBeInTheDocument();
    expect(screen.getByText('Worksheet 2')).toBeInTheDocument();
  });

  test('renders NotebookWorksheet when there is an active worksheet', () => {
    render(<QueryPanel />);
    expect(screen.getByTestId('notebook-worksheet')).toBeInTheDocument();
    expect(screen.getByText('Notebook for ws1')).toBeInTheDocument();
  });

  test('shows "No worksheet selected" message when activeWorksheetId is null', () => {
    useStore.mockImplementation(selector => {
      const state = { ...mockStoreState, activeWorksheetId: null };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);
    expect(screen.getByText('No worksheet selected')).toBeInTheDocument();
    expect(screen.queryByTestId('notebook-worksheet')).not.toBeInTheDocument();
  });

  test('calls createNewWorksheet when "Create Worksheet" button is clicked', async () => {
    useStore.mockImplementation(selector => {
      const state = { ...mockStoreState, activeWorksheetId: null };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);
    const createBtn = screen.getByRole('button', { name: /create worksheet/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockStoreState.createNewWorksheet).toHaveBeenCalledTimes(1);
    });
  });

  test('calls createNewWorksheet when new worksheet button in tab manager is clicked', async () => {
    render(<QueryPanel />);
    const newWorksheetBtn = screen.getByTestId('create-worksheet-btn');
    fireEvent.click(newWorksheetBtn);

    await waitFor(() => {
      expect(mockStoreState.createNewWorksheet).toHaveBeenCalledTimes(1);
    });
  });

  test('calls updateWorksheetData when worksheet is renamed', async () => {
    render(<QueryPanel />);
    const renameInput = screen.getByTestId('rename-input-ws1');

    fireEvent.change(renameInput, { target: { value: 'New Name' } });
    fireEvent.blur(renameInput);

    await waitFor(() => {
      expect(mockStoreState.updateWorksheetData).toHaveBeenCalledWith('ws1', {
        name: 'New Name',
      });
    });
  });

  test('calls setActiveWorksheet when worksheet tab is selected', () => {
    render(<QueryPanel />);
    const worksheet2Tab = screen.getByText('Worksheet 2');
    fireEvent.click(worksheet2Tab);

    expect(mockStoreState.setActiveWorksheet).toHaveBeenCalledWith('ws2');
  });

  test('renders error message when worksheetsError is present', () => {
    useStore.mockImplementation(selector => {
      const state = { ...mockStoreState, worksheetsError: 'Failed to load worksheets' };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);
    expect(screen.getByText('Failed to load worksheets')).toBeInTheDocument();
  });

  test('dismisses error when dismiss button is clicked', () => {
    useStore.mockImplementation(selector => {
      const state = { ...mockStoreState, worksheetsError: 'Failed to load worksheets' };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    expect(mockStoreState.clearWorksheetError).toHaveBeenCalledTimes(1);
  });

  test('updates selected source and worksheet when source is changed', async () => {
    render(<QueryPanel />);
    const sourceDropdown = screen.getByTestId('source-dropdown');

    fireEvent.change(sourceDropdown, { target: { value: 'source2' } });

    await waitFor(() => {
      expect(mockStoreState.setSelectedSource).toHaveBeenCalledWith({ name: 'source2' });
      expect(mockStoreState.updateWorksheetData).toHaveBeenCalledWith('ws1', {
        selected_source: 'source2',
      });
    });
  });

  test('renders SourceDropdown with correct selected source', () => {
    render(<QueryPanel />);
    const sourceDropdown = screen.getByTestId('source-dropdown');
    expect(sourceDropdown.value).toBe('source1');
  });

  test('filters worksheets to only show visible ones', () => {
    useStore.mockImplementation(selector => {
      const state = {
        ...mockStoreState,
        worksheets: [
          ...mockStoreState.worksheets,
          { id: 'ws3', name: 'Hidden Worksheet', is_visible: false },
        ],
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);

    expect(screen.getByText('Worksheet 1')).toBeInTheDocument();
    expect(screen.getByText('Worksheet 2')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Worksheet')).not.toBeInTheDocument();
  });

  test('handles createWorksheet error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockError = new Error('Failed to create');
    useStore.mockImplementation(selector => {
      const state = {
        ...mockStoreState,
        createNewWorksheet: jest.fn().mockRejectedValue(mockError),
        activeWorksheetId: null,
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);
    const createBtn = screen.getByRole('button', { name: /create worksheet/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create worksheet:', mockError);
    });

    consoleErrorSpy.mockRestore();
  });

  test('handles rename error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockError = new Error('Failed to rename');
    useStore.mockImplementation(selector => {
      const state = {
        ...mockStoreState,
        updateWorksheetData: jest.fn().mockRejectedValue(mockError),
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);
    const renameInput = screen.getByTestId('rename-input-ws1');
    fireEvent.change(renameInput, { target: { value: 'New Name' } });
    fireEvent.blur(renameInput);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to rename worksheet:', mockError);
    });

    consoleErrorSpy.mockRestore();
  });

  test('handles source change error gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockError = new Error('Failed to update source');
    useStore.mockImplementation(selector => {
      const state = {
        ...mockStoreState,
        updateWorksheetData: jest.fn().mockRejectedValue(mockError),
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<QueryPanel />);
    const sourceDropdown = screen.getByTestId('source-dropdown');
    fireEvent.change(sourceDropdown, { target: { value: 'source2' } });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to update worksheet source:',
        mockError
      );
    });

    consoleErrorSpy.mockRestore();
  });
});
