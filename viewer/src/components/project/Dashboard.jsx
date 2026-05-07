import Chart from '../items/Chart';
import Table from '../items/Table';
import useDimensions from 'react-cool-dimensions';
import { throwError } from '../../api/utils';
import Markdown from '../items/Markdown';
import Input from '../items/Input';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useInsightsData } from '../../hooks/useInsightsData';
import { useModelsData } from '../../hooks/useModelsData';
import { useInputsData } from '../../hooks/useInputsData';
import { useVisibleRows } from '../../hooks/useVisibleRows';
import { extractRefNamesFromStrings } from '../../utils/refString';
import { captureDashboardThumbnail } from './captureDashboardThumbnail';

const isModelData = data => data && (data.sql || data.args || data.models);

/**
 * Walk every Item across a list of rows, descending through `item.rows`
 * row-containers so nested charts/tables/inputs are also reached.
 */
const forEachItemDeep = (rows, callback) => {
  if (!rows) return;
  for (const row of rows) {
    if (!row || !row.items) continue;
    for (const item of row.items) {
      callback(item);
      if (item.rows && item.rows.length > 0) {
        forEachItemDeep(item.rows, callback);
      }
    }
  }
};

const collectDataNames = (rows, visibleRowIndices, shouldShowItem, knownInsightNames = new Set()) => {
  const insightNames = new Set();
  const modelNames = new Set();
  const pivotRefStrings = [];

  const visibleSeed = visibleRowIndices
    .map(idx => rows[idx])
    .filter(row => row);

  forEachItemDeep(visibleSeed, item => {
    if (shouldShowItem && !shouldShowItem(item)) return;
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
  });

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

const collectInputNames = (rows, visibleRowIndices, shouldShowItem) => {
  const inputNames = new Set();
  const visibleSeed = visibleRowIndices
    .map(idx => rows[idx])
    .filter(row => row);

  forEachItemDeep(visibleSeed, item => {
    if (shouldShowItem && !shouldShowItem(item)) return;
    if (item.input?.name) {
      inputNames.add(item.input.name);
    }
  });
  return [...inputNames];
};

const Dashboard = ({ project, dashboardName }) => {
  const dashboardRootRef = useRef(null);

  // Viewport-based loading: Track which rows are visible
  const { visibleRows, setRowRef } = useVisibleRows(dashboardName);

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

  // Relative-weight mapping for sub-rows nested inside an Item's `rows` field.
  // Top-level rows interpret `height` as absolute pixels (getHeight). Nested
  // sub-rows reuse the same enum as a relative weight that divides the parent
  // slot's height. See specs/dashboard-building/04-open-questions.md Q9.
  const heightToWeight = height => {
    if (height === 'compact') return 1;
    if (height === 'xsmall') return 1;
    if (height === 'small') return 2;
    if (height === 'medium') return 3;
    if (height === 'large') return 4;
    if (height === 'xlarge') return 6;
    return 8; // xxlarge
  };

  // `containerPixelWidth` is the row's own pixel width — the dashboard width at
  // the top level, but the parent item slot's width inside a nested row. Without
  // threading this down, nested charts size to the dashboard width and overflow
  // their slot, which then collapses sibling grid tracks.
  const getWidth = (items, item, containerPixelWidth) => {
    const containerWidth =
      typeof containerPixelWidth === 'number' && containerPixelWidth > 0
        ? containerPixelWidth
        : width;
    if (containerWidth < widthBreakpoint) {
      return containerWidth;
    }
    const totalWidth = items.reduce((partialSum, i) => {
      const itemWidth = i.width ? i.width : 1;
      return partialSum + itemWidth;
    }, 0) || 1;

    const itemWidth = item.width ? item.width : 1;
    return containerWidth * (itemWidth / totalWidth);
  };

  const dashboard = project.project_json.dashboards.find(d => d.name === dashboardName);
  if (!dashboard) {
    throwError(`Dashboard with name ${dashboardName} not found.`, 404);
  }

  // Capture-on-view: once the user actually opens a dashboard and it has
  // finished rendering, snapshot it for the cards listing. This replaces the
  // old offscreen-render queue that tried to bulk-generate thumbnails for
  // every dashboard at once. Only runs when there's no existing thumbnail.
  useEffect(() => {
    let cancelled = false;
    captureDashboardThumbnail({
      dashboardName,
      getElement: () => dashboardRootRef.current,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [dashboardName]);

  const shouldShowNamedModel = useCallback(
    namedModel => {
      if (!namedModel || !namedModel.name) {
        return true;
      }
      return true;
    },
    []
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
    forEachItemDeep(dashboard.rows || [], item => {
      item.chart?.insights?.forEach(i => { if (i.name) names.add(i.name); });
      if (item.table?.data?.name && !isModelData(item.table.data)) {
        names.add(item.table.data.name);
      }
    });
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

  // Render a single dashboard item.
  // `slotPixelHeight` is the pixel height the parent row reserved for this slot;
  // it sizes the chart/table inside the slot AND sub-rows when the item is a
  // row-container. `slotPixelWidth` is the parent row's pixel width; threaded
  // so nested charts size from the slot, not the dashboard. `keyPrefix`
  // namespaces children when rendered inside nested-rows.
  const renderItem = (item, row, itemIndex, rowIndex, shouldLoad, items, slotPixelHeight, slotPixelWidth, keyPrefix = '') => {
    if (items.indexOf(item) < 0) {
      return null;
    }
    const key = `${keyPrefix}dashboardRow${rowIndex}Item${itemIndex}`;
    const effectiveSlotWidth = getWidth(items, item, slotPixelWidth);

    // Row-container item: render nested rows as a vertical flex stack with
    // weight-based heights (Q9 — sub-row heights are relative weights inside
    // the parent slot, not absolute pixels).
    if (item.rows && item.rows.length > 0) {
      const subRows = item.rows;
      const totalWeight = subRows.reduce(
        (sum, r) => sum + heightToWeight(r.height), 0
      ) || 1;
      const parentPixelHeight = typeof slotPixelHeight === 'number' && slotPixelHeight > 0
        ? slotPixelHeight
        : getHeight(row.height);
      return (
        <div
          key={key}
          className="dashboard-nested-rows flex flex-col w-full h-full"
          data-testid="dashboard-nested-rows"
          style={{ gap: '0.5rem', minWidth: 0, minHeight: 0 }}
        >
          {subRows.map((subRow, subIdx) => {
            const subHeightPx = parentPixelHeight * (heightToWeight(subRow.height) / totalWeight);
            return (
              <div
                key={`${key}-sub-${subIdx}`}
                className="dashboard-nested-subrow w-full"
                data-testid="dashboard-nested-subrow"
                style={{
                  flex: `${heightToWeight(subRow.height)} 1 0`,
                  minWidth: 0,
                  minHeight: 0,
                  height: subHeightPx,
                }}
              >
                {renderNestedRow(subRow, subIdx, itemIndex, rowIndex, shouldLoad, subHeightPx, effectiveSlotWidth, `${key}-sub-${subIdx}-`)}
              </div>
            );
          })}
        </div>
      );
    }

    const effectiveSlotHeight = typeof slotPixelHeight === 'number' && slotPixelHeight > 0
      ? slotPixelHeight
      : getHeight(row.height);

    if (item.input) {
      return (
        <Input
          input={item.input}
          project={project}
          itemWidth={item.width}
          key={key}
        ></Input>
      );
    } else if (item.table) {
      return (
        <Table
          table={item.table}
          project={project}
          itemWidth={item.width}
          width={effectiveSlotWidth}
          height={effectiveSlotHeight}
          shouldLoad={shouldLoad}
          key={key}
        />
      );
    } else if (item.chart) {
      return (
        <Chart
          chart={item.chart}
          project={project}
          height={effectiveSlotHeight - 8}
          width={effectiveSlotWidth}
          itemWidth={item.width}
          shouldLoad={shouldLoad}
          key={key}
        />
      );
    } else if (item.markdown) {
      return (
        <Markdown
          key={key}
          markdown={item.markdown}
          row={row}
          height={effectiveSlotHeight}
        />
      );
    }
    return null;
  };

  // Sub-row that lives inside an Item's `rows` field. Same grid layout as a
  // top-level row, but height is governed by the parent slot's flex allocation
  // rather than the row's pixel-mapped HeightEnum. Reuses renderItem so leaf-
  // vs-row-container handling stays shared.
  const renderNestedRow = (subRow, subRowIndex, parentItemIndex, parentRowIndex, shouldLoad, slotPixelHeight, slotPixelWidth, keyPrefix) => {
    if (!subRow || !subRow.items) return null;
    const visibleItems = subRow.items.filter(shouldShowItem);
    const totalWidth = visibleItems.reduce((sum, item) => sum + (item.width || 1), 0) || 1;
    return (
      <div
        className={`dashboard-nested-row w-full h-full ${isColumn ? 'flex' : 'grid'}`}
        style={{
          display: isColumn ? 'flex' : 'grid',
          flexDirection: isColumn ? 'column' : undefined,
          gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, 1fr)`,
          gap: '0.5rem',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {visibleItems.map((item, itemIdx) => (
          <div
            key={`${keyPrefix}item-${itemIdx}`}
            className={isColumn ? 'w-full max-w-full' : ''}
            style={{
              gridColumn: isColumn ? undefined : `span ${item.width || 1}`,
              width: isColumn ? '100%' : 'auto',
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <div className="flex items-center h-full w-full max-w-full">
              {renderItem(
                item,
                subRow,
                itemIdx,
                parentRowIndex,
                shouldLoad,
                visibleItems,
                slotPixelHeight,
                slotPixelWidth,
                keyPrefix,
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

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
          // Vertical-only margin so the row stays inside the wrapper's
          // horizontal padding. The previous all-side `margin: 0.5rem`
          // combined with `width: 100%` pushed the row 8px past the wrapper's
          // right padding edge, producing asymmetric left/right gaps.
          marginTop: '0.5rem',
          marginBottom: '0.5rem',
          display: isColumn ? 'flex' : 'grid',
          flexDirection: isColumn ? 'column' : undefined,
          gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, 1fr)`,
          gap: '0.7rem',
          minWidth: 0,
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
              // Grid items default to min-width: auto (== min-content). If a
              // child (e.g. Plotly chart at fixed pixel width) exceeds 1/N of
              // the row, CSS grid will steal track width from siblings to fit.
              // min-width: 0 lets grid distribute the row by `fr` units even
              // when content overflows; the chart's pixel width is constrained
              // by `effectiveSlotWidth` inside renderItem.
              minWidth: 0,
            }}
          >
            <div className="flex items-center h-full w-full max-w-full" style={{ minWidth: 0 }}>
              {renderItem(
                item,
                row,
                itemIndex,
                rowIndex,
                shouldLoad,
                visibleItems,
                row.height !== 'compact' ? getHeight(row.height) : undefined,
                width,
              )}
            </div>
          </div>
        ))}
      </div>
    );
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
      ref={el => {
        dashboardRootRef.current = el;
        observe(el);
      }}
      data-testid={`dashboard_${dashboardName}`}
      // overflow-x-clip (NOT overflow-x-hidden) keeps horizontal-overflow
      // protection without forcing the browser to set overflow-y to auto,
      // which would create an inner scroll trap on tall dashboards.
      // px-6: symmetric 24px horizontal padding. pb-8: 32px bottom padding so
      // the last row isn't flush against the page edge.
      className="flex grow flex-col justify-items-stretch w-full max-w-full overflow-x-clip px-6 pb-8"
    >
      {(dashboard.rows || []).map(renderRow)}
    </div>
  );
};

export default Dashboard;
