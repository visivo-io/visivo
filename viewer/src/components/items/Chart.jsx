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
import { useInsightsData } from '../../hooks/useInsightsData';
import { chartDataFromInsightData } from '../../models/Insight';

const Chart = React.forwardRef(({ chart, project, itemWidth, height, width }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();

  // Expose loading state through ref
  useImperativeHandle(
    ref,
    () => ({
      isLoading,
    }),
    [isLoading]
  );

  const traceNames = chart.traces.map(trace => trace.name);
  const tracesData = useTracesData(project.id, traceNames);

  const insightNames = chart.insights.map(insight => insight.name);
  const { insightsData, isInsightsLoading } = useInsightsData(project.id, insightNames);

  const [hovering, setHovering] = useState(false);
  const [cohortSelectVisible, setCohortSelectVisible] = useState(false);

  const [selectedCohortData, setSelectedCohortData] = useState([]);

  const selectedPlotData = useMemo(() => {
    return traceNamesInData(selectedCohortData)
      .map(traceName => {
        const trace = chart.traces.find(trace => trace.name === traceName);
        if (!trace) {
          return [];
        }
        return Object.keys(selectedCohortData[traceName]).map(cohortName => {
          const chartData = chartDataFromCohortData(
            selectedCohortData[traceName][cohortName],
            trace,
            cohortName
          );
          return chartData;
        });
      })
      .flat();
  }, [selectedCohortData, chart.traces]);

  const selectedInsightPlotData = useMemo(() => {
    return chart.insights.length > 0 ? chartDataFromInsightData(insightsData) : [];
  }, [insightsData, chart.insights]);

  const hasInsights = chart.insights && chart.insights.length > 0;

  const isDataLoading = !tracesData || (hasInsights && isInsightsLoading);

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
              tracesData={tracesData}
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
        data={[...selectedInsightPlotData, ...selectedPlotData]}
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