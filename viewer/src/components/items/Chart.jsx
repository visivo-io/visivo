import Loading from '../common/Loading';
import Menu from './Menu';
import Plot from 'react-plotly.js';
import React, { useState, useMemo, useImperativeHandle } from 'react';
import CohortSelect from '../select/CohortSelect';
import { traceNamesInData, chartDataFromCohortData } from '../../models/Trace';
import { useTracesData } from '../../hooks/useTracesData';
import MenuItem from '../styled/MenuItem';
import { ItemContainer } from './ItemContainer';
import { itemNameToSlug } from './utils';
import MenuContainer from './MenuContainer';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { chartDataFromInsightData } from '../../models/Insight';
import useStore from '../../stores/store';
import { useShallow } from 'zustand/react/shallow';

const Chart = React.forwardRef(({ chart, project, itemWidth, height, width, shouldLoad = true }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  // Performance optimization: Subscribe only to inputs this chart's insights depend on
  // Step 1: Get insight names this chart uses (memoized, changes only when chart.insights changes)
  const chartInsightNames = useMemo(() => {
    if (!chart.insights?.length) return [];
    return chart.insights.map(insight => insight.name);
  }, [chart.insights]);

  // Step 2: Subscribe to relevant inputs using pre-computed inputDependencies from insight objects
  // Uses useShallow for Zustand 5.x compatibility - caches result with shallow equality comparison
  const inputs = useStore(
    useShallow(state => {
      // Early return for charts without insights
      if (!chartInsightNames.length) return {};

      const result = {};
      // Get input names from pre-computed insight dependencies
      for (const insightName of chartInsightNames) {
        const insight = state.insights[insightName];
        if (insight?.inputDependencies) {
          for (const inputName of insight.inputDependencies) {
            if (state.inputs[inputName]) {
              result[inputName] = state.inputs[inputName];
            }
          }
        }
      }
      return result;
    })
  );

  // Expose loading state through ref
  useImperativeHandle(
    ref,
    () => ({
      isLoading,
    }),
    [isLoading]
  );

  const traceNames = chart.traces.map(trace => trace.name);
  const hasTraces = traceNames.length > 0;
  // Viewport-based loading: Only fetch data when shouldLoad is true
  const tracesData = useTracesData(project.id, shouldLoad ? traceNames : []);

  const hasInsights = chart.insights && chart.insights.length > 0;

  // Read insights data from store (Dashboard prefetches all visible insights)
  // Uses useShallow for shallow equality comparison to avoid infinite re-renders
  const insightsData = useStore(
    useShallow(state => {
      if (!chartInsightNames.length) return {};
      const data = {};
      for (const name of chartInsightNames) {
        if (state.insights[name]) data[name] = state.insights[name];
      }
      return data;
    })
  );

  // Check if all insight data is loaded (data !== null means loaded, data === null means pending)
  const hasAllInsightData = useMemo(() => {
    if (!chartInsightNames.length) return true;
    return chartInsightNames.every(
      name =>
        insightsData[name]?.data !== undefined &&
        insightsData[name]?.data !== null &&
        !insightsData[name]?.pendingInputs?.length
    );
  }, [chartInsightNames, insightsData]);

  // For insight-only charts (no traces), don't wait for tracesData
  // For trace-based charts, wait for tracesData to load
  const isTracesLoading = hasTraces && !tracesData;
  // For insights, check if data is available in store
  const isInsightsWaiting = hasInsights && !hasAllInsightData;
  // Viewport-based loading: Show loading if not yet visible (shouldLoad=false)
  const isDataLoading = !shouldLoad || isTracesLoading || isInsightsWaiting;

  const [hovering, setHovering] = useState(false);
  const [cohortSelectVisible, setCohortSelectVisible] = useState(false);

  const [selectedCohortData, setSelectedCohortData] = useState([]);

  const selectedPlotData = useMemo(() => {
    let data = [];

    // Handle trace-based data
    if (selectedCohortData && Object.keys(selectedCohortData).length > 0) {
      const traceData = traceNamesInData(selectedCohortData)
        .map(traceName => {
          const trace = chart.traces.find(t => t.name === traceName);
          if (!trace) return [];
          return Object.keys(selectedCohortData[traceName]).map(cohortName =>
            chartDataFromCohortData(selectedCohortData[traceName][cohortName], trace, cohortName)
          );
        })
        .flat();
      data.push(...traceData);
    }

    // Handle insight-based data
    if (hasInsights && insightsData) {
      const insightName = chart.insights[0]?.name;
      const insightData = chartDataFromInsightData(insightsData, inputs);
      // Use sourceInsight for split traces (which have modified names), fall back to name for non-split
      data.push(
        ...insightData.filter(insight => (insight.sourceInsight || insight.name) === insightName)
      );
    }

    return data;
  }, [selectedCohortData, insightsData, chart.traces, chart.insights, hasInsights, inputs]);

  if (isDataLoading) {
    return <Loading text={chart.name} width={itemWidth} />;
  }

  const onSelectedCohortChange = changedSelectedTracesData => {
    setIsLoading(true);
    setSelectedCohortData(changedSelectedTracesData);
  };

  const layout = structuredClone(chart.layout ? chart.layout : {});

  return (
    <ItemContainer
      onMouseOver={() => setHovering(true)}
      onMouseOut={() => setHovering(false)}
      id={itemNameToSlug(chart.name)}
    >
      <MenuContainer>
        <Menu hovering={hovering && cohortSelectVisible}>
          <MenuItem>
            <CohortSelect
              tracesData={tracesData || {}}
              onChange={onSelectedCohortChange}
              selector={chart.selector}
              parentName={chart.name}
              parentType="chart"
              onVisible={visible => setCohortSelectVisible(visible)}
            />
          </MenuItem>
        </Menu>
        <Menu
          hovering={hovering && cohortSelectVisible}
          withDropDown={false}
          buttonChildren={<FontAwesomeIcon icon={faShareAlt} />}
          buttonProps={{
            style: {
              cursor: 'pointer',
              visibility: hovering ? 'visible' : 'hidden',
            },
            onClick: () => {
              const url = new URL(window.location.href);
              url.searchParams.set('element_id', window.scrollY);
              copyText(url.toString());
            },
            onMouseLeave: resetToolTip,
          }}
          showToolTip
          toolTip={toolTip}
        ></Menu>
      </MenuContainer>
      <Plot
        key={`chart_${chart.name}`}
        data-testid={`chart_${chart.name}`}
        data={selectedPlotData}
        layout={{ ...layout, height, width }}
        useResizeHandler={true}
        config={{ displayModeBar: false }}
        onAfterPlot={() => {
          setIsLoading(false);
        }}
      />
    </ItemContainer>
  );
});

export default Chart;
