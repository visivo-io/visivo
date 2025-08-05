import Loading from '../common/Loading';
import Menu from './Menu';
import Plot from 'react-plotly.js';
import React, { useState, useMemo, useEffect, useImperativeHandle } from 'react';
import CohortSelect from '../select/CohortSelect';
import { useTracesData } from '../../hooks/useTracesData';
import useStore from '../../stores/store';
import MenuItem from '../styled/MenuItem';
import { ItemContainer } from './ItemContainer';
import { itemNameToSlug } from './utils';
import MenuContainer from './MenuContainer';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareAlt } from '@fortawesome/free-solid-svg-icons';

const Chart = React.forwardRef(({ chart, project, itemWidth, height, width }, ref) => {
  const { toolTip, copyText, resetToolTip } = useCopyToClipboard();
  const [hovering, setHovering] = useState(false);
  const [cohortSelectVisible, setCohortSelectVisible] = useState(false);
  const [selectedCohorts, setSelectedCohorts] = useState([]);

  // Get raw traces data
  const { data: rawTracesData, isLoading: isRawDataLoading } = useTracesData(chart.traces);

  // Get store methods for trace processing
  const {
    processTraces,
    areTracesReady,
    areAnyTracesLoading,
    getAllCohortNames,
    filterTraceObjectsByCohorts
  } = useStore();

  // Process traces when raw data is available
  useEffect(() => {
    if (rawTracesData && Object.keys(rawTracesData).length > 0) {
      processTraces(chart.traces, rawTracesData);
    }
  }, [rawTracesData, chart.traces, processTraces]);

  // Get trace names for processing
  const traceNames = useMemo(() => 
    chart.traces.map(trace => trace.name), 
    [chart.traces]
  );

  // Check if all traces are ready
  const isTracesReady = areTracesReady(traceNames);
  const isProcessing = areAnyTracesLoading(traceNames);
  
  // Compute loading state
  const isLoading = isRawDataLoading || isProcessing || !isTracesReady;

  // Expose loading state through ref
  useImperativeHandle(
    ref,
    () => ({
      isLoading,
    }),
    [isLoading]
  );

  // Get all available cohort names
  const allCohortNames = useMemo(() => 
    getAllCohortNames(traceNames), 
    [getAllCohortNames, traceNames]
  );

  // Get filtered trace objects based on selected cohorts
  const plotData = useMemo(() => {
    if (!isTracesReady) return [];
    
    return filterTraceObjectsByCohorts(traceNames, selectedCohorts);
  }, [filterTraceObjectsByCohorts, traceNames, selectedCohorts, isTracesReady]);

  if (isLoading) {
    return <Loading text={chart.name} width={itemWidth} />;
  }

  const onSelectedCohortChange = (newSelectedCohorts) => {
    setSelectedCohorts(newSelectedCohorts);
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
              cohortNames={allCohortNames}
              selectedCohorts={selectedCohorts}
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
        data={plotData}
        layout={{ ...layout, height, width }}
        useResizeHandler={true}
        config={{ displayModeBar: false }}
      />
    </ItemContainer>
  );
});

export default Chart;
