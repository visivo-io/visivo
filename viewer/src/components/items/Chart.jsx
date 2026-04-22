import Loading from '../common/Loading';
import Menu from './Menu';
import Plot from 'react-plotly.js';
import React, { useState, useMemo, useImperativeHandle } from 'react';
import { ItemContainer } from './ItemContainer';
import { itemNameToSlug } from './utils';
import MenuContainer from './MenuContainer';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareAlt } from '@fortawesome/free-solid-svg-icons';
import { chartDataFromInsightData } from '../../models/Insight';
import useStore from '../../stores/store';
import { useShallow } from 'zustand/react/shallow';

const Chart = React.forwardRef(({ chart, projectId, itemWidth, height, width, shouldLoad = true, hideToolbar = false, plotlyConfig, onRelayout }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

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

  const [hovering, setHovering] = useState(false);

  const selectedPlotData = useMemo(() => {
    const data = [];

    if (hasInsights && insightsData) {
      const insightNames = chart.insights.map(i => i.name);
      const insightData = chartDataFromInsightData(insightsData, inputs);
      data.push(
        ...insightData.filter(insight => insightNames.includes(insight.sourceInsight || insight.name))
      );
    }

    return data;
  }, [insightsData, chart.insights, hasInsights, inputs]);

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
    if (height !== undefined) layout.height = height;
    if (width !== undefined) layout.width = width;
    return layout;
  }, [layoutRef, height, width]);

  const plotConfig = useMemo(
    () => plotlyConfig || { displayModeBar: false, responsive: true },
    [plotlyConfig]
  );

  if (isDataLoading) {
    return <Loading text={chart.name} width={itemWidth} />;
  }

  return (
    <ItemContainer
      className={hideToolbar ? 'h-full' : ''}
      onMouseOver={() => setHovering(true)}
      onMouseOut={() => setHovering(false)}
      id={itemNameToSlug(chart.name)}
    >
      {!hideToolbar && (
        <MenuContainer>
          <Menu
            hovering={hovering}
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
      )}
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
