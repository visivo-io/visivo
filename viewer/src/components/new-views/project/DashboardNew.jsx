import React, { useEffect, useMemo, useCallback } from 'react';
import useDimensions from 'react-cool-dimensions';
import useStore from '../../../stores/store';
import Chart from '../../items/Chart';
import Table from '../../items/Table';
import Markdown from '../../items/Markdown';
import Input from '../../items/Input';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useModelsData } from '../../../hooks/useModelsData';
import { useInputsData } from '../../../hooks/useInputsData';
import { useVisibleRows } from '../../../hooks/useVisibleRows';
import { parseRefValue, extractRefNamesFromStrings } from '../../../utils/refString';

/**
 * Resolve an item reference (chart, table, markdown, input) from the store.
 * Handles both string references (names), context strings (${ ref(...) }), and legacy embedded objects.
 * Transforms insight/input string references to object format expected by components.
 */
const resolveItem = (itemRef, getItemByName) => {
  if (!itemRef) return null;

  // If it's a string, parse the ref and look up from store
  if (typeof itemRef === 'string') {
    const name = parseRefValue(itemRef);
    const item = getItemByName(name);
    const config = item?.config || null;

    if (!config) return null;

    // Transform insights array from string references to objects with name property
    // Chart/Table components expect insights to be [{name: 'insight-name'}] not ["${ref(insight-name)}"]
    if (config.insights && Array.isArray(config.insights)) {
      config.insights = config.insights.map(insight => {
        if (typeof insight === 'string') {
          const insightName = parseRefValue(insight);
          return { name: insightName };
        }
        return insight; // Already an object
      });
    }

    return config;
  }

  // Legacy: If it's already an object, use it directly
  return itemRef;
};

/**
 * Collect all insight names from visible rows for centralized prefetching.
 */
const isModelData = data => data && (data.sql || data.args || data.models);

/**
 * Recursively yield every Item across a list of rows, descending through
 * `item.rows` row-containers. Used by the data-collection helpers below so
 * nested charts/tables/inputs are also prefetched.
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

const collectDataNames = (rows, visibleRowIndices, shouldShowItem, getChartByName, getTableByName, knownInsightNames = new Set()) => {
  const insightNames = new Set();
  const modelNames = new Set();
  const pivotRefStrings = [];

  // Visible top-level rows define the seed; once we descend into an item's nested rows,
  // every item in that subtree is treated as visible (the parent slot's visibility
  // implies its children are loaded).
  const visibleSeed = visibleRowIndices
    .map(idx => rows[idx])
    .filter(row => row);

  forEachItemDeep(visibleSeed, item => {
    if (shouldShowItem && !shouldShowItem(item)) return;

    const chart = resolveItem(item.chart, getChartByName);
    chart?.insights?.forEach(i => {
      const insightName = typeof i === 'string' ? parseRefValue(i) : i?.name;
      if (insightName) insightNames.add(insightName);
    });

    const table = resolveItem(item.table, getTableByName);
    if (table?.data) {
      const tableData = typeof table.data === 'string' ? table.data : table.data;
      const name = typeof tableData === 'string' ? parseRefValue(tableData) : tableData?.name;
      if (name) {
        if (typeof tableData === 'object' && isModelData(tableData)) {
          modelNames.add(name);
        } else {
          insightNames.add(name);
        }
      }
    }
    const tableConfig = table?.config || table || {};
    pivotRefStrings.push(
      ...(tableConfig.columns || []),
      ...(tableConfig.rows || []),
      ...(tableConfig.values || []),
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

/**
 * Collect all input names from visible rows for centralized prefetching.
 * Recurses through nested `item.rows` row-containers.
 */
const collectInputNames = (rows, visibleRowIndices, shouldShowItem) => {
  const inputNames = new Set();
  const visibleSeed = visibleRowIndices
    .map(idx => rows[idx])
    .filter(row => row);

  forEachItemDeep(visibleSeed, item => {
    if (shouldShowItem && !shouldShowItem(item)) return;
    if (item.input) {
      const inputName = typeof item.input === 'string'
        ? parseRefValue(item.input)
        : item.input?.name;
      if (inputName) {
        inputNames.add(inputName);
      }
    }
  });
  return [...inputNames];
};

/**
 * DashboardNew - Renders a single dashboard using data from stores
 * Shows draft versions of objects merged with published versions
 */
const DashboardNew = ({ projectId, dashboardName }) => {
  // Dashboard store (fetched by ProjectNew container)
  const dashboards = useStore(state => state.dashboards);

  // Chart store
  const fetchCharts = useStore(state => state.fetchCharts);
  const charts = useStore(state => state.charts);
  const getChartByName = useStore(state => state.getChartByName);

  // Table store
  const fetchTables = useStore(state => state.fetchTables);
  const tables = useStore(state => state.tables);
  const getTableByName = useStore(state => state.getTableByName);

  // Markdown store
  const fetchMarkdowns = useStore(state => state.fetchMarkdowns);
  const getMarkdownByName = useStore(state => state.getMarkdownByName);

  // Input store
  const fetchInputs = useStore(state => state.fetchInputs);
  const getInputByName = useStore(state => state.getInputByName);

  // Viewport-based loading: Track which rows are visible
  const { visibleRows, setRowRef } = useVisibleRows(dashboardName);

  // Responsive width tracking
  const { observe, width } = useDimensions({
    onResize: ({ observe }) => {
      observe();
    },
  });

  const widthBreakpoint = 1024;
  const isColumn = width < widthBreakpoint;

  // Fetch item data on mount (dashboards fetched by ProjectNew container)
  useEffect(() => {
    fetchCharts();
    fetchTables();
    fetchMarkdowns();
    fetchInputs();
  }, [fetchCharts, fetchTables, fetchMarkdowns, fetchInputs]);

  // Find the current dashboard and extract its config
  const dashboard = useMemo(() => {
    const dashboardData = dashboards?.find(d => d.name === dashboardName);
    if (!dashboardData) return null;

    // Dashboard data from API has rows in config field
    return dashboardData.config || dashboardData;
  }, [dashboards, dashboardName]);

  // Height calculation helpers
  const getHeight = height => {
    if (height === 'xsmall') return 128;
    if (height === 'small') return 256;
    if (height === 'medium') return 396;
    if (height === 'large') return 512;
    if (height === 'xlarge') return 768;
    return 1024;
  };

  // Relative-weight mapping for sub-rows nested inside an Item's `rows` field.
  // When a Row appears at the top level its `height` is interpreted as absolute
  // pixels via getHeight() above. When nested inside an Item, the same enum
  // becomes a relative weight that divides the parent slot's height.
  // See specs/dashboard-building/04-open-questions.md Q9.
  const heightToWeight = height => {
    if (height === 'compact') return 1;
    if (height === 'xsmall') return 1;
    if (height === 'small') return 2;
    if (height === 'medium') return 3;
    if (height === 'large') return 4;
    if (height === 'xlarge') return 6;
    return 8; // xxlarge
  };

  // Compute the pixel width an item should use for chart/table sizing.
  // `containerPixelWidth` is the pixel width of the row this item lives in —
  // the dashboard's measured width at the top level, but the item's parent
  // slot inside a nested row-container. Without this, nested charts size
  // themselves to the dashboard width and overflow their slot, which then
  // collapses sibling grid tracks (CSS grid resolves min-content overflow
  // by stealing track width from siblings).
  const getWidth = (items, item, containerPixelWidth) => {
    const containerWidth =
      typeof containerPixelWidth === 'number' && containerPixelWidth > 0
        ? containerPixelWidth
        : width;
    if (containerWidth < widthBreakpoint) {
      return containerWidth;
    }
    const totalWidth = items.reduce((sum, i) => sum + (i.width || 1), 0) || 1;
    const itemWidth = item.width || 1;
    return containerWidth * (itemWidth / totalWidth);
  };

  // Item visibility logic (no selector support needed)
  const shouldShowItem = useCallback(() => true, []);

  // Centralized input prefetching - fetch for ALL rows (optimize later)
  const visibleInputNames = useMemo(() => {
    if (!dashboard?.rows) return [];
    const allRowIndices = dashboard.rows.map((_, idx) => idx);
    return collectInputNames(dashboard.rows, allRowIndices, shouldShowItem);
  }, [dashboard?.rows, shouldShowItem]);

  useInputsData(projectId, visibleInputNames);

  const knownInsightNames = useMemo(() => {
    const names = new Set();
    forEachItemDeep(dashboard?.rows, item => {
      const chart = resolveItem(item.chart, getChartByName);
      chart?.insights?.forEach(i => {
        const n = typeof i === 'string' ? parseRefValue(i) : i?.name;
        if (n) names.add(n);
      });
      const table = resolveItem(item.table, getTableByName);
      if (table?.data) {
        const tableData = typeof table.data === 'string' ? table.data : table.data;
        const name = typeof tableData === 'string' ? parseRefValue(tableData) : tableData?.name;
        if (name && !(typeof tableData === 'object' && isModelData(tableData))) {
          names.add(name);
        }
      }
    });
    return names;
  }, [dashboard?.rows, getChartByName, getTableByName]);

  const { visibleInsightNames, visibleModelNames } = useMemo(() => {
    if (!dashboard?.rows) return { visibleInsightNames: [], visibleModelNames: [] };
    const allRowIndices = dashboard.rows.map((_, idx) => idx);
    const { insightNames, modelNames } = collectDataNames(
      dashboard.rows,
      allRowIndices,
      shouldShowItem,
      getChartByName,
      getTableByName,
      knownInsightNames
    );
    return { visibleInsightNames: insightNames, visibleModelNames: modelNames };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.rows, charts, tables, getChartByName, getTableByName, shouldShowItem]);

  useInsightsData(projectId, visibleInsightNames);
  useModelsData(projectId, visibleModelNames);

  // Render a dashboard item.
  // `slotPixelHeight` is the pixel height the parent row reserved for this slot;
  // it's used to size the chart/table inside the slot AND to size sub-rows when
  // the item is a row-container. `keyPrefix` namespaces children when the item
  // is being rendered inside a nested-rows context (so React keys stay unique
  // across multiple flips of the same dashboard).
  const renderItem = (item, row, itemIndex, rowIndex, shouldLoad, items, slotPixelHeight, slotPixelWidth, keyPrefix = '') => {
    const key = `${keyPrefix}dashboardRow${rowIndex}Item${itemIndex}`;

    // Pixel width this item slot was given by its parent row. Used for chart
    // sizing on leaves AND threaded down into nested rows so nested charts
    // size from the slot, not the dashboard.
    const effectiveSlotWidth = getWidth(items, item, slotPixelWidth);

    // Row-container item: render nested rows as a vertical flex stack with
    // weight-based heights (see Q9 — sub-row heights are relative weights inside
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

    if (item.input) {
      const input = resolveItem(item.input, getInputByName);
      if (!input) {
        return (
          <div key={key} className="flex items-center justify-center h-full text-gray-500 text-sm">
            Input not found: {typeof item.input === 'string' ? item.input : 'unknown'}
          </div>
        );
      }
      return (
        <Input
          key={key}
          input={input}
          projectId={projectId}
          itemWidth={item.width}
        />
      );
    }

    // Slot-aware pixel height: nested renders pass an override based on the
    // parent slot's allotted space; top-level renders fall back to the row's
    // enum-mapped pixel height (existing behavior).
    const effectiveSlotHeight = typeof slotPixelHeight === 'number' && slotPixelHeight > 0
      ? slotPixelHeight
      : getHeight(row.height);

    if (item.chart) {
      const chart = resolveItem(item.chart, getChartByName);
      if (!chart) {
        return (
          <div key={key} className="flex items-center justify-center h-full text-gray-500 text-sm">
            Chart not found: {typeof item.chart === 'string' ? item.chart : 'unknown'}
          </div>
        );
      }
      return (
        <Chart
          key={key}
          chart={chart}
          projectId={projectId}
          height={effectiveSlotHeight - 8}
          width={effectiveSlotWidth}
          itemWidth={item.width}
          shouldLoad={shouldLoad}
        />
      );
    }

    if (item.table) {
      const table = resolveItem(item.table, getTableByName);
      if (!table) {
        return (
          <div key={key} className="flex items-center justify-center h-full text-gray-500 text-sm">
            Table not found: {typeof item.table === 'string' ? item.table : 'unknown'}
          </div>
        );
      }
      return (
        <Table
          key={key}
          table={table}
          projectId={projectId}
          itemWidth={item.width}
          width={effectiveSlotWidth}
          height={effectiveSlotHeight}
          shouldLoad={shouldLoad}
        />
      );
    }

    if (item.markdown) {
      const markdown = resolveItem(item.markdown, getMarkdownByName);
      if (!markdown) {
        return (
          <div key={key} className="flex items-center justify-center h-full text-gray-500 text-sm">
            Markdown not found: {typeof item.markdown === 'string' ? item.markdown : 'unknown'}
          </div>
        );
      }
      return (
        <Markdown
          key={key}
          markdown={markdown}
          row={row}
          height={effectiveSlotHeight}
        />
      );
    }

    return null;
  };

  // Render a sub-row that lives inside an Item's `rows` field. Same grid layout
  // as a top-level row, but height is governed by the parent slot's flex
  // allocation rather than the row's pixel-mapped HeightEnum. Reuses renderItem
  // so leaf-vs-row-container handling is shared with the top level.
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

  // Render a dashboard row
  const renderRow = (row, rowIndex) => {
    const visibleItems = row.items.filter(shouldShowItem);
    const totalWidth = visibleItems.reduce((sum, item) => sum + (item.width || 1), 0);
    const rowStyle = isColumn ? {} : { height: row.height !== 'compact' ? getHeight(row.height) : undefined };
    const shouldLoad = visibleRows.has(rowIndex);

    return (
      <div
        key={`row-${rowIndex}`}
        ref={el => setRowRef(el, rowIndex)}
        data-row-index={rowIndex}
        className={`dashboard-row w-full max-w-full ${isColumn ? 'flex' : 'grid justify-center'}`}
        style={{
          // Use vertical-only margin so the row stays inside its parent's
          // horizontal padding. The previous `margin: 0.5rem` (all four sides)
          // combined with `width: 100%` pushed the row 8px past the wrapper's
          // right padding edge, producing asymmetric left/right gaps
          // (~24px left vs ~8px right). Keeping vertical spacing between rows
          // and letting the wrapper's `px-6` handle horizontal padding gives
          // a symmetric ~24px on both sides.
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
            key={`item-${rowIndex}-${itemIndex}`}
            className={isColumn ? 'w-full max-w-full' : ''}
            style={{
              gridColumn: isColumn ? undefined : `span ${item.width || 1}`,
              width: isColumn ? '100%' : 'auto',
              // CRITICAL: grid items default to min-width: auto, which equals
              // their content's intrinsic min-content width. If a child (e.g.
              // a Plotly chart with a fixed pixel width) exceeds 1/N of the
              // row, CSS grid will steal track width from siblings to fit.
              // min-width: 0 lets grid distribute the row by `fr` units even
              // when content overflows; the chart's pixel width is then
              // constrained by `effectiveSlotWidth` inside renderItem.
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
                width, // top-level container width = dashboard width
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Loading state
  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  // Empty dashboard state
  if (!dashboard.rows || dashboard.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">This dashboard is empty</div>
      </div>
    );
  }

  return (
    <div
      ref={observe}
      data-testid={`dashboard_${dashboardName}`}
      // overflow-x-clip (NOT overflow-x-hidden) keeps horizontal-overflow
      // protection without forcing the browser to set overflow-y to auto.
      // With overflow-x-hidden, the browser silently switches overflow-y from
      // visible to auto, creating an inner scroll area on the dashboard div
      // that traps the bottom of tall dashboards (last rows clipped at the
      // wrapper's measured height, e.g. Section 4 of nested-layouts-dashboard
      // ending 88px below the wrapper's auto-sized scroll bottom).
      // overflow-x-clip is Tailwind v4+ and clips without changing Y.
      //
      // px-6: symmetric 24px horizontal padding on every dashboard.
      // pb-8:  32px bottom padding so the last row isn't flush against the
      //        page edge (longstanding pet peeve). Top padding is handled by
      //        the parent route's pt-12.
      className="flex grow flex-col justify-items-stretch w-full max-w-full overflow-x-clip px-6 pb-8"
    >
      {dashboard.rows.map(renderRow)}
    </div>
  );
};

export default DashboardNew;
