import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Chart from './Chart';
import ViewItemActionsContext from './ViewItemActionsContext';
import { withProviders } from '../../utils/test-utils';

let capturedLayout = null;

jest.mock('react-plotly.js', () => {
  return function MockPlot(props) {
    capturedLayout = props.layout;
    return <div>Mock Plot</div>;
  };
});

let chart;

beforeEach(() => {
  capturedLayout = null;
  chart = {
    name: 'name',
    insights: [],
  };
});

describe('Chart', () => {
  test('renders chart', async () => {
    render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });

    await waitFor(() => {
      expect(screen.getByText('Mock Plot')).toBeInTheDocument();
    });
  });

  describe('View-mode share-button suppression', () => {
    test('renders the built-in share button by default (no context)', async () => {
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      expect(await screen.findByText('Mock Plot')).toBeInTheDocument();
      // The share Menu renders a button in the MenuContainer (visibility toggles
      // on hover, so it is `hidden` to the a11y tree at rest — query includes it).
      expect(screen.getAllByRole('button', { hidden: true }).length).toBeGreaterThan(0);
    });

    test('suppresses the built-in share button when suppressItemShare is on', async () => {
      const Wrapper = ({ children }) =>
        withProviders({
          children: (
            <ViewItemActionsContext.Provider value={{ suppressItemShare: true }}>
              {children}
            </ViewItemActionsContext.Provider>
          ),
        });
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: Wrapper });
      expect(await screen.findByText('Mock Plot')).toBeInTheDocument();
      // The kebab owns Copy in View mode — Chart renders no share button.
      expect(screen.queryAllByRole('button', { hidden: true })).toHaveLength(0);
    });
  });

  describe('layout defaults', () => {
    test('applies default horizontal legend below plot when legend is unset', async () => {
      chart.layout = {};
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedLayout).not.toBeNull());
      expect(capturedLayout.legend).toEqual({ orientation: 'h', y: -0.2, x: 0 });
    });

    test('preserves user-supplied legend config (no override)', async () => {
      chart.layout = {
        legend: { orientation: 'v', x: 1.02, y: 1, xanchor: 'left' },
      };
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedLayout).not.toBeNull());
      expect(capturedLayout.legend).toEqual({
        orientation: 'v',
        x: 1.02,
        y: 1,
        xanchor: 'left',
      });
    });

    test('applies default margin when margin is unset', async () => {
      chart.layout = {};
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedLayout).not.toBeNull());
      expect(capturedLayout.margin).toEqual({ t: 40, r: 20, b: 80, l: 60 });
    });

    test('preserves user-supplied margin', async () => {
      chart.layout = { margin: { t: 100, r: 100, b: 10, l: 10 } };
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedLayout).not.toBeNull());
      expect(capturedLayout.margin).toEqual({ t: 100, r: 100, b: 10, l: 10 });
    });

    test('applies default colorway when colorway is unset', async () => {
      chart.layout = {};
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedLayout).not.toBeNull());
      expect(capturedLayout.colorway).toBeDefined();
      expect(capturedLayout.colorway).toContain('#713B57');
    });
  });
});
