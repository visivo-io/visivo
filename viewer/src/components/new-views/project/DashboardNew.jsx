import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import useDimensions from 'react-cool-dimensions';
import useStore from '../../../stores/store';
import Chart from '../../items/Chart';
import Table from '../../items/Table';
import Markdown from '../../items/Markdown';
import Input from '../../items/Input';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useInputsData } from '../../../hooks/useInputsData';
import { useVisibleRows } from '../../../hooks/useVisibleRows';
import { parseRefValue } from '../../../utils/refString';

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
const collectInsightNames = (rows, visibleRowIndices, shouldShowItem, getChartByName, getTableByName) => {
  const insightNames = new Set();
  for (const rowIndex of visibleRowIndices) {
    const row = rows[rowIndex];
    if (!row) continue;
    for (const item of row.items) {
      if (shouldShowItem && !shouldShowItem(item)) continue;

      // Resolve chart and collect its insights
      const chart = resolveItem(item.chart, getChartByName);
      chart?.insights?.forEach(i => {
        // Parse insight reference - could be ${ref(name)}, ref(name), or plain name
        const insightName = typeof i === 'string' ? parseRefValue(i) : i?.name;
        if (insightName) insightNames.add(insightName);
      });

      // Resolve table and collect its insights
      const table = resolveItem(item.table, getTableByName);
      table?.insights?.forEach(i => {
        // Parse insight reference - could be ${ref(name)}, ref(name), or plain name
        const insightName = typeof i === 'string' ? parseRefValue(i) : i?.name;
        if (insightName) insightNames.add(insightName);
      });
    }
  }
  return [...insightNames];
};

/**
 * Collect all input names from visible rows for centralized prefetching.
 */
const collectInputNames = (rows, visibleRowIndices, shouldShowItem) => {
  const inputNames = new Set();
  for (const rowIndex of visibleRowIndices) {
    const row = rows[rowIndex];
    if (!row) continue;
    for (const item of row.items) {
      if (shouldShowItem && !shouldShowItem(item)) continue;
      // Input can be a string reference or object with name
      if (item.input) {
        const inputName = typeof item.input === 'string'
          ? parseRefValue(item.input)
          : item.input?.name;
        if (inputName) {
          inputNames.add(inputName);
        }
      }
    }
  }
  return [...inputNames];
};

/**
 * DashboardNew - Renders a single dashboard using data from stores
 * Shows draft versions of objects merged with published versions
 */
const DashboardNew = ({ projectId, dashboardName }) => {
  const [searchParams] = useSearchParams();

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

  const getWidth = (items, item) => {
    if (width < widthBreakpoint) {
      return width;
    }
    const totalWidth = items.reduce((sum, i) => sum + (i.width || 1), 0);
    const itemWidth = item.width || 1;
    return width * (itemWidth / totalWidth);
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

  // Centralized insight prefetching - fetch for ALL rows (optimize later)
  const visibleInsightNames = useMemo(() => {
    if (!dashboard?.rows) return [];
    // Collect from all rows, not just visible ones
    const allRowIndices = dashboard.rows.map((_, idx) => idx);
    return collectInsightNames(
      dashboard.rows,
      allRowIndices,
      shouldShowItem,
      getChartByName,
      getTableByName
    );
  }, [dashboard?.rows, charts, tables, getChartByName, getTableByName, shouldShowItem]);

  useInsightsData(projectId, visibleInsightNames);

  // Render a dashboard item
  const renderItem = (item, row, itemIndex, rowIndex, shouldLoad, items) => {
    const key = `dashboardRow${rowIndex}Item${itemIndex}`;

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
          height={getHeight(row.height) - 8}
          width={getWidth(items, item)}
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
          width={getWidth(items, item)}
          height={getHeight(row.height)}
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
          height={getHeight(row.height)}
        />
      );
    }

    return null;
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
            key={`item-${rowIndex}-${itemIndex}`}
            className={isColumn ? 'w-full max-w-full' : ''}
            style={{
              gridColumn: isColumn ? undefined : `span ${item.width || 1}`,
              width: isColumn ? '100%' : 'auto',
            }}
          >
            <div className="flex items-center h-full w-full max-w-full">
              {renderItem(item, row, itemIndex, rowIndex, shouldLoad, visibleItems)}
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
      className="flex grow flex-col justify-items-stretch w-full max-w-full overflow-x-hidden px-4"
    >
      {dashboard.rows.map(renderRow)}
    </div>
  );
};

export default DashboardNew;
