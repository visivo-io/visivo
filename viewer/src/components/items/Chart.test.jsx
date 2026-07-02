import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Chart from './Chart';
import { withProviders } from '../../utils/test-utils';
import useStore from '../../stores/store';

let capturedLayout = null;
let capturedData = null;
let capturedConfig = null;

jest.mock('react-plotly.js', () => {
  const React = require('react');
  return function MockPlot(props) {
    capturedLayout = props.layout;
    capturedData = props.data;
    capturedConfig = props.config;
    // Simulate Plotly signalling the plot finished drawing.
    React.useEffect(() => {
      if (props.onAfterPlot) props.onAfterPlot();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div>Mock Plot</div>;
  };
});

let chart;

beforeEach(() => {
  capturedLayout = null;
  capturedData = null;
  capturedConfig = null;
  chart = {
    name: 'name',
    insights: [],
  };
  useStore.setState({ insightJobs: {}, inputJobs: {} });
});

describe('Chart', () => {
  test('renders chart', async () => {
    render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });

    await waitFor(() => {
      expect(screen.getByText('Mock Plot')).toBeInTheDocument();
    });
  });

  describe('no built-in share button', () => {
    test('Chart renders no built-in Copy/share button (the kebab owns Copy)', async () => {
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      expect(await screen.findByText('Mock Plot')).toBeInTheDocument();
      // The per-item Copy link lives ONLY in the flip-layer kebab now — Chart
      // itself renders no share button (and no toolbar).
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

    test('hideToolbar forces layout autosize', async () => {
      chart.layout = {};
      render(<Chart chart={chart} project={{ id: 1 }} hideToolbar />, {
        wrapper: withProviders,
      });
      await waitFor(() => expect(capturedLayout).not.toBeNull());
      expect(capturedLayout.autosize).toBe(true);
    });

    test('explicit height/width props flow into the plot layout', async () => {
      render(<Chart chart={chart} project={{ id: 1 }} height={320} width={640} />, {
        wrapper: withProviders,
      });
      await waitFor(() => expect(capturedLayout).not.toBeNull());
      expect(capturedLayout.height).toBe(320);
      expect(capturedLayout.width).toBe(640);
    });
  });

  describe('plot config', () => {
    test('defaults to a hidden mode bar + responsive plot', async () => {
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedConfig).not.toBeNull());
      expect(capturedConfig).toEqual({ displayModeBar: false, responsive: true });
    });

    test('a custom plotlyConfig replaces the default', async () => {
      const custom = { displayModeBar: true, staticPlot: true };
      render(<Chart chart={chart} project={{ id: 1 }} plotlyConfig={custom} />, {
        wrapper: withProviders,
      });
      await waitFor(() => expect(capturedConfig).not.toBeNull());
      expect(capturedConfig).toEqual(custom);
    });
  });

  describe('insight-backed charts', () => {
    test('renders plot data derived from the insight job via props_mapping', async () => {
      chart.insights = [{ name: 'i1' }];
      useStore.setState({
        insightJobs: {
          i1: {
            data: [
              { xcol: 1, ycol: 10 },
              { xcol: 2, ycol: 20 },
            ],
            props_mapping: { 'props.x': 'xcol', 'props.y': 'ycol' },
            type: 'bar',
          },
        },
      });
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedData).not.toBeNull());
      expect(capturedData).toHaveLength(1);
      expect(capturedData[0]).toMatchObject({
        name: 'i1',
        type: 'bar',
        x: [1, 2],
        y: [10, 20],
      });
    });

    test('shows Loading (not the plot) while an insight job is missing', () => {
      chart.insights = [{ name: 'i1' }];
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.queryByText('Mock Plot')).not.toBeInTheDocument();
    });

    test('shows Loading while an insight still has pending inputs', () => {
      chart.insights = [{ name: 'i1' }];
      useStore.setState({
        insightJobs: {
          i1: {
            data: [{ xcol: 1 }],
            props_mapping: { 'props.x': 'xcol' },
            pendingInputs: ['picker'],
          },
        },
      });
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.queryByText('Mock Plot')).not.toBeInTheDocument();
    });

    test('shows Loading when shouldLoad is false', () => {
      render(<Chart chart={chart} project={{ id: 1 }} shouldLoad={false} />, {
        wrapper: withProviders,
      });
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.queryByText('Mock Plot')).not.toBeInTheDocument();
    });

    test('renders when the insight depends on resolved input jobs', async () => {
      chart.insights = [{ name: 'i1' }];
      useStore.setState({
        insightJobs: {
          i1: {
            data: [{ xcol: 1 }],
            props_mapping: { 'props.x': 'xcol' },
            inputDependencies: ['picker', 'unknown-input'],
            pendingInputs: [],
          },
        },
        inputJobs: { picker: { value: 'east' } },
      });
      render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });
      await waitFor(() => expect(capturedData).not.toBeNull());
      expect(capturedData[0]).toMatchObject({ name: 'i1', x: [1] });
    });
  });

  describe('imperative handle', () => {
    test('exposes isLoading, flipping false once the plot has drawn', async () => {
      const ref = React.createRef();
      render(<Chart ref={ref} chart={chart} project={{ id: 1 }} />, {
        wrapper: withProviders,
      });
      await waitFor(() => expect(ref.current.isLoading).toBe(false));
    });
  });
});
