import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom';
import ExplorerOverlay from './ExplorerOverlay';
import useStore from '../../stores/store';
import { futureFlags } from '../../router-config';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// The real Explorer surface is heavy; stub it. The "Save and place" button it
// would render comes from the round-trip context, which we exercise via the
// overlay's own handler in these tests through a stubbed ExplorerNewPage that
// reads the context.
jest.mock('./ExplorerNewPage', () => {
  const { useExplorerRoundTrip } = jest.requireActual('./ExplorerRoundTripContext');
  return function MockExplorerNewPage() {
    const rt = useExplorerRoundTrip();
    return (
      <div data-testid="explorer-surface">
        {rt && (
          <button
            data-testid="mock-save-and-place"
            disabled={rt.saving}
            onClick={() => rt.onSaveAndPlace()}
          >
            save-and-place
          </button>
        )}
      </div>
    );
  };
});

const renderOverlay = (entry = '/workspace/dashboard/sales/explorer?return_to=workspace&slot=0:end') =>
  render(
    <MemoryRouter initialEntries={[entry]} future={futureFlags}>
      <Routes>
        <Route path="/workspace/dashboard/:dashboardName/explorer" element={<ExplorerOverlay />} />
      </Routes>
    </MemoryRouter>
  );

describe('ExplorerOverlay (J-2 / VIS-778)', () => {
  let saveExplorerObjects;
  let placeChartInDashboardSlot;

  beforeEach(() => {
    mockNavigate.mockClear();
    saveExplorerObjects = jest.fn().mockResolvedValue({ success: true, errors: [] });
    placeChartInDashboardSlot = jest.fn().mockResolvedValue({ success: true });
    useStore.setState({
      saveExplorerObjects,
      placeChartInDashboardSlot,
      explorerChartName: 'revenue_chart',
    });
  });

  it('renders the framed overlay with the origin breadcrumb', () => {
    renderOverlay();
    expect(screen.getByTestId('explorer-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-overlay-card')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-overlay-dashboard')).toHaveTextContent('sales');
    expect(screen.getByTestId('explorer-overlay-slot')).toHaveTextContent('end of row 1');
  });

  it('renders the Explorer surface inside the overlay', () => {
    renderOverlay();
    expect(screen.getByTestId('explorer-surface')).toBeInTheDocument();
  });

  it('Save and place: saves, wraps+places the chart, then closes to the dashboard', async () => {
    renderOverlay();
    fireEvent.click(screen.getByTestId('mock-save-and-place'));
    await waitFor(() => {
      expect(saveExplorerObjects).toHaveBeenCalledTimes(1);
    });
    expect(placeChartInDashboardSlot).toHaveBeenCalledWith('sales', 'revenue_chart', '0:end');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/workspace/dashboard/sales?newItem=revenue_chart'
      );
    });
  });

  it('surfaces a save error and does not place', async () => {
    saveExplorerObjects.mockResolvedValue({
      success: false,
      errors: [{ name: 'm', type: 'model', error: 'boom' }],
    });
    renderOverlay();
    fireEvent.click(screen.getByTestId('mock-save-and-place'));
    await waitFor(() => {
      expect(screen.getByTestId('explorer-overlay-error')).toHaveTextContent('boom');
    });
    expect(placeChartInDashboardSlot).not.toHaveBeenCalled();
  });

  it('surfaces a placement error', async () => {
    placeChartInDashboardSlot.mockResolvedValue({ success: false, error: 'no slot' });
    renderOverlay();
    fireEvent.click(screen.getByTestId('mock-save-and-place'));
    await waitFor(() => {
      expect(screen.getByTestId('explorer-overlay-error')).toHaveTextContent('no slot');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('close button returns to the dashboard without saving', () => {
    renderOverlay();
    fireEvent.click(screen.getByTestId('explorer-overlay-close'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/dashboard/sales');
    expect(saveExplorerObjects).not.toHaveBeenCalled();
  });

  it('Esc returns to the dashboard', () => {
    renderOverlay();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/dashboard/sales');
  });

  it('backdrop click returns to the dashboard', () => {
    renderOverlay();
    fireEvent.click(screen.getByTestId('explorer-overlay-backdrop'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/dashboard/sales');
  });

  it('errors when there is no chart to place', async () => {
    useStore.setState({ explorerChartName: null });
    renderOverlay();
    fireEvent.click(screen.getByTestId('mock-save-and-place'));
    await waitFor(() => {
      expect(screen.getByTestId('explorer-overlay-error')).toHaveTextContent(
        /No chart to place/i
      );
    });
    expect(placeChartInDashboardSlot).not.toHaveBeenCalled();
  });

  it('defaults the slot label to a new row when slot=new', () => {
    renderOverlay('/workspace/dashboard/sales/explorer?return_to=workspace&slot=new');
    expect(screen.getByTestId('explorer-overlay-slot')).toHaveTextContent('a new row');
  });
});
