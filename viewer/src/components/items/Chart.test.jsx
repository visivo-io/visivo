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

// The insight preview passed `height={400}` alongside `hideToolbar` (which
// turns on autosize). Plotly discards explicit dimensions when autosize is on,
// so the value was silently dropped — but not before a re-render could paint at
// it, which is a wrong-height flash in a container of any other size.
describe('Chart — autosize and explicit dimensions are mutually exclusive', () => {
  test('an autosize chart ignores an explicit height rather than fighting it', () => {
    render(<Chart chart={chart} projectId="p1" hideToolbar height={400} shouldLoad />);
    expect(capturedLayout.autosize).toBe(true);
    expect(capturedLayout.height).toBeUndefined();
    expect(capturedLayout.width).toBeUndefined();
  });

  test('a fixed-size chart still honours its height — the dashboard path', () => {
    render(<Chart chart={chart} projectId="p1" height={320} width={640} shouldLoad />);
    expect(capturedLayout.autosize).toBeFalsy();
    expect(capturedLayout.height).toBe(320);
    expect(capturedLayout.width).toBe(640);
  });

  // The mirror of the case above, and the one that was unguarded: the fixed
  // dimensions can come from the chart's OWN layout rather than from a prop.
  // `surface-chart` in test-projects/integration is exactly this config, and
  // every one of its keys is schema-allowed. Previewing it (workspace
  // ChartPreview passes `hideToolbar`) produced `{autosize: true, width: 500,
  // height: 500}` — two authorities, which Plotly resolves in favour of the
  // dimensions, so the "fill the pane" the `hideToolbar` autosize exists to
  // produce never happened and the plot stayed 500x500 in a pane of any size.
  test('a config-supplied width/height does not survive the autosize hideToolbar forces', () => {
    chart.layout = { title: { text: 'Plot' }, autosize: false, width: 500, height: 500 };
    render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);
    expect(capturedLayout.autosize).toBe(true);
    expect(capturedLayout.width).toBeUndefined();
    expect(capturedLayout.height).toBeUndefined();
    // Everything else about the authored layout is untouched.
    expect(capturedLayout.title).toEqual({ text: 'Plot' });
  });

  test('a config-supplied width/height IS honoured when nothing forces autosize', () => {
    chart.layout = { autosize: false, width: 500, height: 500 };
    render(<Chart chart={chart} projectId="p1" shouldLoad />);
    expect(capturedLayout.autosize).toBe(false);
    expect(capturedLayout.width).toBe(500);
    expect(capturedLayout.height).toBe(500);
  });
});

// M28 — Plotly re-measures its node only on a window `resize` event
// (react-plotly.js's `useResizeHandler` is a window listener; plotly.js ships
// no ResizeObserver). A pane that resizes without the window resizing — a rail
// drag, a collapsed editor, a banner appearing above the plot — therefore left
// the figure at its last measured size. Chart observes its container and
// re-fires that same event.
//
// The geometry itself is proven in the browser (e2e/stories/
// explorer-chart-fills-pane.spec.mjs measures pane-vs-plot rects); jsdom has no
// layout, so these tests pin the WIRING: what gets observed, that a resize is
// forwarded, that a burst is coalesced, that it is torn down, and — the #634
// constraint — that a caller-sized chart is never observed at all.
describe('Chart — a container resize reaches Plotly (M28)', () => {
  let observers;
  let originalResizeObserver;
  let rafQueue;
  let rafSpy;
  let cancelSpy;
  let resizeEvents;
  let onWindowResize;

  const flushFrames = () => {
    const queued = rafQueue.splice(0);
    queued.forEach(cb => cb());
  };

  beforeEach(() => {
    observers = [];
    originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class MockResizeObserver {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        this.disconnected = false;
        observers.push(this);
      }
      observe(node) {
        this.targets.push(node);
      }
      unobserve(node) {
        this.targets = this.targets.filter(t => t !== node);
      }
      disconnect() {
        this.disconnected = true;
      }
      /** Test-only: emulate the browser delivering a size change. */
      emit(contentRect = { width: 800, height: 600 }) {
        this.callback([{ contentRect, target: this.targets[0] }], this);
      }
    };

    // Hold rAF callbacks so a burst can be observed before it is flushed.
    rafQueue = [];
    rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    cancelSpy = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    resizeEvents = 0;
    onWindowResize = () => {
      resizeEvents += 1;
    };
    window.addEventListener('resize', onWindowResize);
  });

  afterEach(() => {
    window.removeEventListener('resize', onWindowResize);
    rafSpy.mockRestore();
    cancelSpy.mockRestore();
    global.ResizeObserver = originalResizeObserver;
  });

  test('observes the rendered plot container when Plotly owns the sizing', () => {
    render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);

    expect(observers).toHaveLength(1);
    const [observed] = observers[0].targets;
    // Not just "something was observed": it must be the real DOM node that
    // wraps the plot, which also proves the ref reaches ItemContainer.
    expect(observed).toBeInstanceOf(HTMLElement);
    expect(observed).toContainElement(screen.getByText('Mock Plot'));
  });

  test('forwards a container resize as the window event Plotly listens for', () => {
    render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);

    expect(resizeEvents).toBe(0);
    observers[0].emit({ width: 640, height: 480 });
    // Deferred to the next frame, never dispatched inline from the callback.
    expect(resizeEvents).toBe(0);
    flushFrames();
    expect(resizeEvents).toBe(1);
  });

  test('coalesces a burst of resize entries into one dispatch per frame', () => {
    render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);

    // What a drag actually produces: an entry every frame.
    observers[0].emit({ width: 640, height: 480 });
    observers[0].emit({ width: 620, height: 480 });
    observers[0].emit({ width: 600, height: 480 });
    expect(rafQueue).toHaveLength(1);
    flushFrames();
    expect(resizeEvents).toBe(1);

    // …and the next frame's change is not swallowed by the coalescing.
    observers[0].emit({ width: 580, height: 480 });
    flushFrames();
    expect(resizeEvents).toBe(2);
  });

  test('ignores a zero-size box — a hidden pane must not trigger a Plotly resize', () => {
    render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);

    observers[0].emit({ width: 0, height: 0 });
    expect(rafQueue).toHaveLength(0);
    flushFrames();
    expect(resizeEvents).toBe(0);
  });

  test('disconnects the observer on unmount', () => {
    const { unmount } = render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);

    expect(observers[0].disconnected).toBe(false);
    unmount();
    expect(observers[0].disconnected).toBe(true);
  });

  test('cancels a pending frame on unmount rather than dispatching after teardown', () => {
    const { unmount } = render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);

    observers[0].emit({ width: 640, height: 480 });
    expect(rafQueue).toHaveLength(1);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  test('does NOT observe when the caller owns the size — #634 stays intact', () => {
    // The dashboard path: explicit width and height, no autosize. Plotly is not
    // measuring anything here, so re-measuring the container would reintroduce
    // exactly the second sizing authority #634 removed.
    render(<Chart chart={chart} projectId="p1" height={320} width={640} shouldLoad />);

    expect(capturedLayout.autosize).toBeFalsy();
    expect(observers).toHaveLength(0);
  });

  // The gate has to be Plotly's own predicate — "is either dimension missing?"
  // — rather than the `autosize` key, because Plotly answers that question
  // three times (supplyLayoutGlobalDefaults' `coerce('autosize', !(width &&
  // height))`, plotAutoSize's `!layout.width`/`!layout.height`, Plots.resize's
  // `layout.width && layout.height` early return) and never once by looking at
  // `autosize` alone. The next three cases are where the two predicates
  // disagree; all three were wrong before.
  test('observes a chart with NO dimensions at all — Plotly autosizes it implicitly', () => {
    // No `hideToolbar`, so nothing sets `autosize`; Plotly turns it on itself
    // because both dimensions are missing. Gating on the key skipped this.
    render(<Chart chart={chart} projectId="p1" shouldLoad />);

    expect(capturedLayout.autosize).toBeUndefined();
    expect(observers).toHaveLength(1);
    expect(observers[0].targets[0]).toBeInstanceOf(HTMLElement);
  });

  test('observes a chart given only ONE dimension — Plotly still sizes the other', () => {
    render(<Chart chart={chart} projectId="p1" height={320} shouldLoad />);

    expect(capturedLayout.height).toBe(320);
    expect(capturedLayout.width).toBeUndefined();
    expect(observers).toHaveLength(1);
  });

  test('does NOT observe a chart sized by its own config — the dimensions still win', () => {
    // `surface-chart` from test-projects/integration, rendered without
    // `hideToolbar`: the layout keeps its authored 500x500, so Plotly owns
    // nothing and there is nothing for a container resize to change.
    chart.layout = { autosize: false, width: 500, height: 500 };
    render(<Chart chart={chart} projectId="p1" shouldLoad />);

    expect(capturedLayout.width).toBe(500);
    expect(capturedLayout.height).toBe(500);
    expect(observers).toHaveLength(0);
  });

  test('observes that same config once hideToolbar hands sizing to the container', () => {
    // …and now the observation is real work rather than a no-op dispatch:
    // `Plots.resize` early-returns on `layout.width && layout.height`, so
    // before the dimensions were stripped every one of these dispatches woke
    // every window-resize listener in the app and moved nothing.
    chart.layout = { autosize: false, width: 500, height: 500 };
    render(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);

    expect(capturedLayout.width).toBeUndefined();
    expect(capturedLayout.height).toBeUndefined();
    expect(observers).toHaveLength(1);
  });

  test('does not observe while the chart is still showing Loading', () => {
    // No container is rendered yet, so there is nothing to observe; the effect
    // must attach once data lands, not fail silently on a null ref.
    const { rerender } = render(
      <Chart chart={chart} projectId="p1" hideToolbar shouldLoad={false} />
    );
    expect(observers).toHaveLength(0);

    rerender(<Chart chart={chart} projectId="p1" hideToolbar shouldLoad />);
    expect(observers).toHaveLength(1);
    expect(observers[0].targets[0]).toBeInstanceOf(HTMLElement);
  });
});
