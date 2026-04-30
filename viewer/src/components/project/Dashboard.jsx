import Chart from '../items/Chart';
import Table from '../items/Table';
import Selector from '../items/Selector';
import useDimensions from 'react-cool-dimensions';
import { throwError } from '../../api/utils';
import { useSearchParams } from 'react-router-dom';
import { getSelectorByOptionName } from '../../models/Project';
import Markdown from '../items/Markdown';
import Input from '../items/Input';
import { useCallback, useMemo } from 'react';
import { useInsightsData } from '../../hooks/useInsightsData';
import { useModelsData } from '../../hooks/useModelsData';
import { useInputsData } from '../../hooks/useInputsData';
import { useVisibleRows } from '../../hooks/useVisibleRows';
import { extractRefNamesFromStrings } from '../../utils/refString';

const isModelData = data => data && (data.sql || data.args || data.models);

/**
 * Collect insight and model names from visible rows for centralized prefetching.
 */
const collectDataNames = (rows, visibleRowIndices, shouldShowItem, knownInsightNames = new Set()) => {
  const insightNames = new Set();
  const modelNames = new Set();
  const pivotRefStrings = [];

  for (const rowIndex of visibleRowIndices) {
    const row = rows[rowIndex];
    if (!row) continue;
    for (const item of row.items) {
      if (shouldShowItem && !shouldShowItem(item)) continue;
      item.chart?.insights?.forEach(i => insightNames.add(i.name));
      if (item.table?.data?.name) {
        if (isModelData(item.table.data)) {
          modelNames.add(item.table.data.name);
        } else {
          insightNames.add(item.table.data.name);
        }
      }
      pivotRefStrings.push(
        ...(item.table?.columns || []),
        ...(item.table?.rows || []),
        ...(item.table?.values || []),
      );
    }
  }

  // Classify pivot refs: known insights go to insightNames, everything else to modelNames
  const allKnown = new Set([...insightNames, ...knownInsightNames]);
  extractRefNamesFromStrings(pivotRefStrings).forEach(n => {
    if (allKnown.has(n)) {
      insightNames.add(n);
    } else {
      modelNames.add(n);
    }
  });

  return { insightNames: [...insightNames], modelNames: [...modelNames] };
};

/**
 * Collect all input names from visible rows for centralized prefetching.
 * This enables a single useInputsData call instead of N calls from individual Input components.
 */
const collectInputNames = (rows, visibleRowIndices, shouldShowItem) => {
  const inputNames = new Set();
  for (const rowIndex of visibleRowIndices) {
    const row = rows[rowIndex];
    if (!row) continue;
    for (const item of row.items) {
      // Only collect from items that will be rendered
      if (shouldShowItem && !shouldShowItem(item)) continue;
      if (item.input?.name) {
        inputNames.add(item.input.name);
      }
    }
  }
  return [...inputNames];
};

const Dashboard = ({
  project,
  dashboardName,
  isPreview = false,
  previewHeight = 750,
}) => {
  const [searchParams] = useSearchParams();

  // Viewport-based loading: Track which rows are visible
  const { visibleRows: viewportRows, setRowRef } = useVisibleRows(dashboardName);

  const { observe, width } = useDimensions({
    onResize: ({ observe }) => {
      observe();
    },
  });

  const widthBreakpoint = 1024;
  const isColumn = width < widthBreakpoint;

  const getHeight = height => {
    if (height === 'xsmall') {
      return 128;
    } else if (height === 'small') {
      return 256;
    } else if (height === 'medium') {
      return 396;
    } else if (height === 'large') {
      return 512;
    } else if (height === 'xlarge') {
      return 768;
    } else {
      return 1024;
    }
  };

  const getWidth = (items, item) => {
    if (width < widthBreakpoint) {
      return width;
    }
    const totalWidth = items.reduce((partialSum, i) => {
      const itemWidth = i.width ? i.width : 1;
      return partialSum + itemWidth;
    }, 0);

    const itemWidth = item.width ? item.width : 1;
    return width * (itemWidth / totalWidth);
  };

  const dashboard = project.project_json.dashboards.find(d => d.name === dashboardName);
  if (!dashboard) {
    throwError(`Dashboard with name ${dashboardName} not found.`, 404);
  }

  // Preview renders happen offscreen (left: -9999px) so the IntersectionObserver
  // in useVisibleRows never fires. Walk rows in order and only mark enough rows
  // visible to fill the captured thumbnail viewport — anything past that is
  // cropped out anyway, and skipping it avoids needless data fetches that slow
  // down the strictly serial thumbnail queue.
  const visibleRows = useMemo(() => {
    if (!isPreview) return viewportRows;
    const rows = dashboard.rows || [];
    const set = new Set();
    let acc = 0;
    for (let i = 0; i < rows.length; i++) {
      set.add(i);
      acc += rows[i].height === 'compact' ? 64 : getHeight(rows[i].height);
      if (acc >= previewHeight) break;
    }
    return set;
  }, [isPreview, viewportRows, dashboard.rows, previewHeight]);

  const shouldShowNamedModel = useCallback(
    namedModel => {
      if (!namedModel || !namedModel.name) {
        return true;
      }
      const selector = getSelectorByOptionName(project, namedModel.name);
      if (selector && searchParams.has(selector.name)) {
        const selectedNames = searchParams.get(selector.name).split(',');
        if (!selectedNames.includes(namedModel.name)) {
          return false;
        }
      }
      return true;
    },
    [project, searchParams]
  );

  const shouldShowItem = useCallback(
    item => {
      if (!shouldShowNamedModel(item)) {
        return false;
      }
      let object;
      if (item.chart) {
        object = item.chart;
      } else if (item.table) {
        object = item.table;
      } else if (item.selector) {
        object = item.selector;
      } else if (item.input) {
        object = item.input;
      }
      return shouldShowNamedModel(object);
    },
    [shouldShowNamedModel]
  );

  // Centralized input prefetching: Collect all input names from visible rows
  // and load them in a single batch BEFORE insights (so inputs are ready for insight queries).
  const visibleInputNames = useMemo(
    () => collectInputNames(dashboard.rows || [], [...visibleRows], shouldShowItem),
    [dashboard.rows, visibleRows, shouldShowItem]
  );

  // Single batch fetch for all visible inputs (stores results in Zustand)
  useInputsData(project.id, visibleInputNames);

  const knownInsightNames = useMemo(() => {
    const names = new Set();
    for (const row of dashboard.rows || []) {
      for (const item of row.items || []) {
        item.chart?.insights?.forEach(i => { if (i.name) names.add(i.name); });
        if (item.table?.data?.name && !isModelData(item.table.data)) {
          names.add(item.table.data.name);
        }
      }
    }
    return names;
  }, [dashboard.rows]);

  const { visibleInsightNames, visibleModelNames } = useMemo(() => {
    const { insightNames, modelNames } = collectDataNames(
      dashboard.rows || [],
      [...visibleRows],
      shouldShowItem,
      knownInsightNames
    );
    return { visibleInsightNames: insightNames, visibleModelNames: modelNames };
  }, [dashboard.rows, visibleRows, shouldShowItem, knownInsightNames]);

  useInsightsData(project.id, visibleInsightNames);
  useModelsData(project.id, visibleModelNames);

  const renderRow = (row, rowIndex) => {
    if (!shouldShowNamedModel(row)) {
      return null;
    }
    const visibleItems = row.items.filter(shouldShowItem);
    const totalWidth = visibleItems.reduce((sum, item) => sum + (item.width || 1), 0);
    const rowStyle = isColumn ? {} : getHeightStyle(row);
    const shouldLoad = visibleRows.has(rowIndex);

    return (
      <div
        key={`row-${rowIndex}`}
        ref={el => setRowRef(el, rowIndex)}
        data-row-index={rowIndex}
        className={`dashboard-row w-full max-w-full ${isColumn ? 'flex' : 'grid justify-center'}`}
        style={{
          margin: '0.5rem',
          display: isColumn ? 'flex' : 'grid',
          flexDirection: isColumn ? 'column' : undefined,
          gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, 1fr)`,
          gap: '0.7rem',
          ...rowStyle,
        }}
      >
        {visibleItems.map((item, itemIndex) => (
          <div
            key={`item-${rowIndex}-${itemIndex}-${item.chart?.path || item.table?.path || item.selector?.path}`}
            className={isColumn ? 'w-full max-w-full' : ''}
            style={{
              gridColumn: isColumn ? undefined : `span ${item.width || 1}`,
              width: isColumn ? '100%' : 'auto',
            }}
          >
            <div className="flex items-center h-full w-full max-w-full">
              {renderComponent(item, row, itemIndex, rowIndex, shouldLoad)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderComponent = (item, row, itemIndex, rowIndex, shouldLoad = true) => {
    const items = row.items.filter(shouldShowItem);
    if (items.indexOf(item) < 0) {
      return null;
    }
    if (item.input) {
      return (
        <Input
          input={item.input}
          project={project}
          itemWidth={item.width}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        ></Input>
      );
    } else if (item.table) {
      return (
        <Table
          table={item.table}
          project={project}
          itemWidth={item.width}
          width={getWidth(items, item)}
          height={getHeight(row.height)}
          shouldLoad={shouldLoad}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        />
      );
    } else if (item.selector) {
      return (
        <Selector
          selector={item.selector}
          project={project}
          itemWidth={item.width}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        ></Selector>
      );
    } else if (item.chart) {
      return (
        <Chart
          chart={item.chart}
          project={project}
          height={getHeight(row.height) - 8}
          width={getWidth(items, item)}
          itemWidth={item.width}
          shouldLoad={shouldLoad}
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
        />
      );
    } else if (item.markdown) {
      return (
        <Markdown
          key={`dashboardRow${rowIndex}Item${itemIndex}`}
          markdown={item.markdown}
          row={row}
          height={getHeight(row.height)}
        />
      );
    }
    return null;
  };

  const getHeightStyle = row => {
    if (row.height !== 'compact') {
      return { height: getHeight(row.height) };
    } else {
      return null;
    }
  };

  return (
    <div
      ref={observe}
      data-testid={`dashboard_${dashboardName}`}
      className="flex grow flex-col justify-items-stretch w-full max-w-full overflow-x-hidden px-4"
    >
      {(dashboard.rows || []).map(renderRow)}
    </div>
  );
};

export default Dashboard;
