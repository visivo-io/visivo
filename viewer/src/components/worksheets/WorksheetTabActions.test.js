import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorksheetTabActions from './WorksheetTabActions';
import { WorksheetProvider } from '../../contexts/WorksheetContext';
import { QueryProvider } from '../../contexts/QueryContext';
import { BrowserRouter } from 'react-router-dom';
import * as worksheetApi from '../../api/worksheet';

// Mock API calls
jest.mock('../../api/worksheet', () => ({
  listWorksheets: jest.fn().mockResolvedValue([]),
  getWorksheet: jest.fn(),
  createWorksheet: jest.fn(),
  updateWorksheet: jest.fn(),
  deleteWorksheet: jest.fn(),
  getSessionState: jest.fn().mockResolvedValue([]),
  updateSessionState: jest.fn()
}));

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
    { id: '1', name: 'Worksheet 1', is_visible: true },
    { id: '2', name: 'Worksheet 2', is_visible: true }
  ];

  const defaultProps = {
    onWorksheetCreate: jest.fn(),
    onWorksheetOpen: jest.fn(),
    isLoading: false
  };

  const renderComponent = (props = {}) => {
    return render(
      <TestWrapper>
        <WorksheetTabActions {...defaultProps} {...props} />
      </TestWrapper>
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    worksheetApi.listWorksheets.mockResolvedValue(mockWorksheets);
    await act(async () => {
      await worksheetApi.listWorksheets();
    });
  });

  it('renders create and open buttons', () => {
    renderComponent();
    expect(screen.getByTestId('create-worksheet')).toBeInTheDocument();
    expect(screen.getByTestId('open-worksheet')).toBeInTheDocument();
  });

  it('calls onWorksheetCreate when create button is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('create-worksheet'));
    expect(defaultProps.onWorksheetCreate).toHaveBeenCalled();
  });

  it('calls onWorksheetOpen when open button is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('open-worksheet'));
    expect(defaultProps.onWorksheetOpen).toHaveBeenCalled();
  });

  it('disables buttons when isLoading is true', () => {
    renderComponent({ isLoading: true });
    expect(screen.getByTestId('create-worksheet')).toBeDisabled();
    expect(screen.getByTestId('open-worksheet')).toBeDisabled();
  });

  it('enables buttons when isLoading is false', () => {
    renderComponent({ isLoading: false });
    expect(screen.getByTestId('create-worksheet')).not.toBeDisabled();
    expect(screen.getByTestId('open-worksheet')).not.toBeDisabled();
  });

  it('applies correct styles to buttons', () => {
    renderComponent();
    const createButton = screen.getByTestId('create-worksheet');
    const openButton = screen.getByTestId('open-worksheet');
    
    expect(createButton).toHaveClass('p-2');
    expect(openButton).toHaveClass('p-2');
  });
}); 