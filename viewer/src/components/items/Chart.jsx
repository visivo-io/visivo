import Loading from '../common/Loading';
import Plot from 'react-plotly.js';
import React, { useState, useMemo, useImperativeHandle, useEffect, useRef } from 'react';
import { ItemContainer } from './ItemContainer';
import { itemNameToSlug } from './utils';
import { chartDataFromInsightData } from '../../models/Insight';
import useStore from '../../stores/store';
import { useShallow } from 'zustand/react/shallow';

const Chart = React.forwardRef(({ chart, projectId, itemWidth, height, width, shouldLoad = true, hideToolbar = false, plotlyConfig, onRelayout }, ref) => {
  const [isLoading, setIsLoading] = useState(true);

  const chartInsightNames = useMemo(() => {
    if (!chart.insights?.length) return [];
    return chart.insights.map(insight => insight.name);
  }, [chart.insights]);

  const inputs = useStore(
    useShallow(state => {
      if (!chartInsightNames.length) return {};

      const result = {};
      for (const insightName of chartInsightNames) {
        const insight = state.insightJobs[insightName];
        if (insight?.inputDependencies) {
          for (const inputName of insight.inputDependencies) {
            if (state.inputJobs[inputName]) {
              result[inputName] = state.inputJobs[inputName];
            }
          }
        }
      }
      return result;
    })
  );

  useImperativeHandle(
    ref,
    () => ({
      isLoading,
    }),
    [isLoading]
  );

  const hasInsights = chart.insights && chart.insights.length > 0;

  const insightsData = useStore(
    useShallow(state => {
      if (!chartInsightNames.length) return {};
      const data = {};
      for (const name of chartInsightNames) {
        if (state.insightJobs[name]) data[name] = state.insightJobs[name];
      }
      return data;
    })
  );

  // Chart type from the LIVE authored config, so a config-only edit (bar→scatter)
  // that skipped the runner renders immediately instead of showing the artifact's
  // stale type (VIS-1023). Keyed by name, shallow-compared so it only re-renders
  // when a type actually changes; empty in views that don't load insight configs,
  // where chartDataFromInsightData falls back to the artifact type.
  const insightTypeOverrides = useStore(
    useShallow(state => {
      if (!chartInsightNames.length) return {};
      const overrides = {};
      for (const name of chartInsightNames) {
        const config = state.insights?.find(i => i.name === name)?.config;
        const type = config?.props?.type ?? config?.type;
        if (type) overrides[name] = type;
      }
      return overrides;
    })
  );

  const hasAllInsightData = useMemo(() => {
    if (!chartInsightNames.length) return true;
    return chartInsightNames.every(
      name =>
        insightsData[name]?.data !== undefined &&
        insightsData[name]?.data !== null &&
        !insightsData[name]?.pendingInputs?.length
    );
  }, [chartInsightNames, insightsData]);

  const isInsightsWaiting = hasInsights && !hasAllInsightData;
  const isDataLoading = !shouldLoad || isInsightsWaiting;

  const selectedPlotData = useMemo(() => {
    const data = [];

    if (hasInsights && insightsData) {
      const insightNames = chart.insights.map(i => i.name);
      const insightData = chartDataFromInsightData(insightsData, inputs, insightTypeOverrides);
      data.push(
        ...insightData.filter(insight => insightNames.includes(insight.sourceInsight || insight.name))
      );
    }

    return data;
  }, [insightsData, chart.insights, hasInsights, inputs, insightTypeOverrides]);

  const layoutRef = useMemo(() => {
    const l = structuredClone(chart.layout ? chart.layout : {});

    if (!l.colorway) {
      l.colorway = [
        '#713B57', '#FFB400', '#003F91', '#D25946', '#1CA9C9',
        '#999999', '#E63946', '#A8DADC', '#457B9D', '#2B2B2B',
      ];
    }

    if (!l.legend) {
      l.legend = { orientation: 'h', y: -0.2, x: 0 };
    }

    if (!l.margin) {
      l.margin = { t: 40, r: 20, b: 80, l: 60 };
    }

    if (!l.uirevision) {
      l.uirevision = chart.name;
    }

    if (hideToolbar && !l.autosize) {
      l.autosize = true;
    }

    return l;
  }, [chart.layout, chart.name, hideToolbar]);

  const plotLayout = useMemo(() => {
    const layout = { ...layoutRef };
    // `autosize` means "fill the container": Plotly's resize handler measures
    // the node and owns width/height, discarding any explicit values. Setting
    // them anyway is not merely redundant — it hands Plotly two authorities, so
    // a re-render can paint at the fixed size before autosize strips it back.
    // Honour whichever the caller actually asked for rather than both.
    //
    // The dimensions can arrive from EITHER side — the `height`/`width` props
    // (the dashboard's slot) or the chart's own authored `layout` — and until
    // this branch stripped the second source, only the prop side was guarded.
    // A config that carries `width`/`height` (e.g. integration's `surface-chart`:
    // `{autosize: false, width: 500, height: 500}`) therefore reached Plotly as
    // `{autosize: true, width: 500, height: 500}` once `hideToolbar` above
    // forced autosize on, and Plotly resolves that contradiction in favour of
    // the explicit values, silently: `initialAutoSize = (!width || !height) &&
    // autosize` is false (plots.js), `plotAutoSize` only moves a dimension when
    // `!layout.width` / `!layout.height`, and `Plots.resize` early-returns
    // outright when `layout.width && layout.height`. So the chart stayed at its
    // authored 500x500 in a preview pane of any other size AND ignored every
    // resize sent to it. Exactly one authority reaches Plotly.
    if (layout.autosize) {
      delete layout.width;
      delete layout.height;
    } else {
      if (height !== undefined) layout.height = height;
      if (width !== undefined) layout.width = width;
    }
    return layout;
  }, [layoutRef, height, width]);

  const plotConfig = useMemo(
    () => plotlyConfig || { displayModeBar: false, responsive: true },
    [plotlyConfig]
  );

  // M28 — make a CONTAINER resize reach Plotly.
  //
  // Plotly only ever re-measures its node when something tells it to, and the
  // only thing that ever does is a window `resize` event: react-plotly.js's
  // `useResizeHandler` (below) installs a window listener, and plotly.js
  // itself contains no ResizeObserver at all (upstream plotly.js#3984/#7059,
  // react-plotly.js#41/#64). So a pane that changes size while the WINDOW does
  // not — a rail drag, a collapsed editor, a banner appearing above the plot —
  // leaves the figure drawn at its last measured size. Measured before this
  // fix: dragging the workspace right rail took the chart pane from 454px to
  // 354px wide while Plotly's own resolved width moved 452 → 442, i.e. 88px
  // stale.
  //
  // Observing the container and re-firing that same window event adds a
  // TRIGGER for the sizing authority that already exists; it never introduces
  // a second one (#634 — "don't give Plotly two sizing authorities"). The
  // corollary is the `plotlyOwnsSizing` gate: when the layout carries explicit
  // width AND height, the CALLER owns the dimensions, and re-measuring the
  // container would be exactly the second authority #634 removed — so we don't
  // observe at all. (This is also why the dashboard is untouched: it passes
  // both dimensions.)
  //
  // The gate is plotly's OWN predicate, not a paraphrase of it. plots.js
  // decides whether it is sizing itself in three places and all three test the
  // dimensions, never the `autosize` key alone:
  //   supplyLayoutGlobalDefaults: `coerce('autosize', !(layoutIn.width && layoutIn.height))`
  //   plotAutoSize:               `!layout.width` / `!layout.height`
  //   Plots.resize:               early-returns when `layout.width && layout.height`
  // Gating on `!!layout.autosize` instead got BOTH sides wrong. It said yes to
  // a chart Plotly refuses to resize (a config carrying width+height, whose
  // forced `autosize: true` plotly discards — an observer whose every dispatch
  // is a no-op that still wakes every window-resize listener in the app), and
  // it said no to charts Plotly autosizes IMPLICITLY, which is any layout
  // missing either dimension — the `autosize` key need never appear.
  //
  // Cost of using the window event rather than reaching into react-plotly.js
  // for the private per-plot handler: it wakes every other window-resize
  // listener on the page. That is the same trade CenterPanel.jsx and
  // ExplorerInputsToolbar.jsx already make for their own divider/toolbar
  // reflows, it is bounded to autosize charts, it is coalesced to one dispatch
  // per animation frame below, and it depends on no library internals.
  const containerRef = useRef(null);
  const plotlyOwnsSizing = !(plotLayout.width && plotLayout.height);
  useEffect(() => {
    if (!plotlyOwnsSizing || isDataLoading) return undefined;
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;

    let frame = null;
    const observer = new ResizeObserver(entries => {
      // A zero box means the pane is hidden (display:none) or detached;
      // Plotly rejects a resize on a non-displayed div, so skip it.
      const rect = entries[0]?.contentRect;
      if (rect && rect.width === 0 && rect.height === 0) return;
      // A drag emits an entry per frame — coalesce them into one dispatch.
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        window.dispatchEvent(new Event('resize'));
      });
    });
    observer.observe(node);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [plotlyOwnsSizing, isDataLoading]);

  if (isDataLoading) {
    return <Loading text={chart.name} width={itemWidth} />;
  }

  return (
    <ItemContainer
      ref={containerRef}
      className={hideToolbar ? 'h-full' : ''}
      id={itemNameToSlug(chart.name)}
    >
      <Plot
        key={`chart_${chart.name}`}
        data-testid={`chart_${chart.name}`}
        data={selectedPlotData}
        layout={plotLayout}
        useResizeHandler={true}
        config={plotConfig}
        style={{ width: '100%', height: '100%' }}
        onAfterPlot={() => {
          setIsLoading(false);
        }}
        onRelayout={onRelayout}
      />
    </ItemContainer>
  );
});

export default Chart;
