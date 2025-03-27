import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorksheetTabActions from './WorksheetTabActions';
import { WorksheetProvider } from '../../contexts/WorksheetContext';
import { QueryProvider } from '../../contexts/QueryContext';
import { BrowserRouter } from 'react-router-dom';
import * as worksheetApi from '../../api/worksheet';

// Mock API calls
jest.mock('../../api/worksheet');

// Test wrapper component
const TestWrapper = ({ children }) => (
  <BrowserRouter>
    <QueryProvider value={{ fetchTracesQuery: jest.fn(), fetchDashboardQuery: jest.fn() }}>
      <WorksheetProvider>
        {children}
      </WorksheetProvider>
    </QueryProvider>
  </BrowserRouter>
);

describe('WorksheetTabActions', () => {
  const mockWorksheets = [
    { 
      worksheet: { id: '1', name: 'Worksheet 1' },
      session_state: { worksheet_id: '1', is_visible: true }
    },
    { 
      worksheet: { id: '2', name: 'Worksheet 2' },
      session_state: { worksheet_id: '2', is_visible: true }
    }
  ];

  const defaultProps = {
    onWorksheetCreate: jest.fn(),
    onWorksheetOpen: jest.fn(),
    isLoading: false
  };

  const renderComponent = async (props = {}) => {
    // Setup mocks before render
    worksheetApi.listWorksheets.mockResolvedValue(mockWorksheets);
    worksheetApi.getSessionState.mockResolvedValue(mockWorksheets.map(w => w.session_state));

    const view = render(
      <TestWrapper>
        <WorksheetTabActions {...defaultProps} {...props} />
      </TestWrapper>
    );

    // Wait for component to be ready
    await waitFor(() => {
      expect(screen.getByTestId('create-worksheet')).toBeInTheDocument();
    });

    return view;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders create and open buttons', async () => {
    await renderComponent();
    expect(screen.getByTestId('create-worksheet')).toBeInTheDocument();
    expect(screen.getByTestId('open-worksheet')).toBeInTheDocument();
  });

  it('calls onWorksheetCreate when create button is clicked', async () => {
    await renderComponent();
    const createButton = screen.getByTestId('create-worksheet');
    fireEvent.click(createButton);
    expect(defaultProps.onWorksheetCreate).toHaveBeenCalled();
  });

  it('calls onWorksheetOpen when open button is clicked', async () => {
    await renderComponent();
    const openButton = screen.getByTestId('open-worksheet');
    fireEvent.click(openButton);
    expect(defaultProps.onWorksheetOpen).toHaveBeenCalled();
  });

  it('disables buttons when isLoading is true', async () => {
    await renderComponent({ isLoading: true });
    expect(screen.getByTestId('create-worksheet')).toBeDisabled();
    expect(screen.getByTestId('open-worksheet')).toBeDisabled();
  });

  it('enables buttons when isLoading is false', async () => {
    await renderComponent({ isLoading: false });
    expect(screen.getByTestId('create-worksheet')).not.toBeDisabled();
    expect(screen.getByTestId('open-worksheet')).not.toBeDisabled();
  });

  it('applies correct styles to buttons', async () => {
    await renderComponent();
    const createButton = screen.getByTestId('create-worksheet');
    const openButton = screen.getByTestId('open-worksheet');
    
    expect(createButton).toHaveClass('p-2');
    expect(openButton).toHaveClass('p-2');
  });
}); 