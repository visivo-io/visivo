import React, { useEffect, useMemo, useCallback } from 'react';
import useDimensions from 'react-cool-dimensions';
import useStore from '../../stores/store';
import Chart from '../items/Chart';
import Table from '../items/Table';
import Markdown from '../items/Markdown';
import Input from '../items/Input';
import { useInsightsData } from '../../hooks/useInsightsData';
import { useModelsData } from '../../hooks/useModelsData';
import { useInputsData } from '../../hooks/useInputsData';
import { useVisibleRows } from '../../hooks/useVisibleRows';
import { parseRefValue, extractRefNamesFromStrings } from '../../utils/refString';
import TemplateDashboard from './template/TemplateDashboard';
import { prepareTemplate } from './template/templateHtml';
import { chartDataFromInsightData } from '../../models/Insight';
import { seriesOrderOf } from '../../theme/seriesColors';

// Template slots are sized by the template, so they render through the grid's
// item renderer with no row height of their own.
const TEMPLATE_ROW = {};

// Narrowest a NESTED item may get before its sub-row stacks (VIS-1459 / L2).
// Nested containers decide stacking from their own slot, not the dashboard-wide
// breakpoint: a 4/12 slot on a 1200px dashboard is ~370px, so comparing it to
// the 768/1024 breakpoint stacked every nested multi-item row into a column.
// 160px keeps a 2x2 KPI cluster in a 1/3 slot of a 1200px dashboard (186px
// cells) laid out 2x2, while a 1/4 slot (150px cells) still stacks.
export const MIN_NESTED_ITEM_WIDTH = 160;

/**
 * Slot-relative stacking rule for nested rows. Returns true when the narrowest
 * item in `items` would be thinner than MIN_NESTED_ITEM_WIDTH at `slotWidth`.
 * An unmeasured slot (0 / non-number) never commits a stacking decision.
 */
export const shouldStackNested = (slotWidth, items) => {
  if (!(typeof slotWidth === 'number' && slotWidth > 0)) return false;
  const list = Array.isArray(items) ? items : [];
  if (list.length < 2) return false;
  const totalWidth = list.reduce((sum, item) => sum + (item.width || 1), 0) || 1;
  const minWeight = Math.min(...list.map(item => item.width || 1));
  return (slotWidth * minWeight) / totalWidth < MIN_NESTED_ITEM_WIDTH;
};

// Row.height token -> pixels. `compact` wraps markdown/inputs to content; a
// chart or table has no intrinsic height, so it gets the smallest useful plot
// area instead of falling through to the xxlarge default (VIS-1458 L1).
const HEIGHT_PX = { xsmall: 128, small: 256, medium: 396, large: 512, xlarge: 768, xxlarge: 1024 };
const COMPACT_PLOT_HEIGHT = 256;
// Nested sub-row weights (specs/dashboard-building/04-open-questions.md Q9).
// One weight unit is 128px, so an integer pixel height on a sub-row scales in
// proportion to its token-sized siblings instead of collapsing to one bucket
// (VIS-1458 L4).
const HEIGHT_WEIGHT = { compact: 1, xsmall: 1, small: 2, medium: 3, large: 4, xlarge: 6, xxlarge: 8 };
const WEIGHT_PX = 128;
// Smallest height an item gets when its row stacks into a single column
// (VIS-1458 L3). Chart.jsx's default margins take 120px (t 40 + b 80), so
// anything lower leaves a Plotly indicator with no plot area at all.
const STACKED_MIN_ITEM_HEIGHT = 160;
const NESTED_GAP_PX = 8;

// Item.width is validated `>= 1` by the model; anything else (missing, 0,
// negative) renders as a single span (VIS-1458 L5).
const spanOf = item => (typeof item?.width === 'number' && item.width >= 1 ? item.width : 1);

// Floor for a stacked item: a leaf gets STACKED_MIN_ITEM_HEIGHT; a row-container
// needs that much for every sub-row it holds.
const minStackedHeight = item =>
  item?.rows?.length
    ? item.rows.reduce(
        (sum, subRow) =>
          sum + Math.max(STACKED_MIN_ITEM_HEIGHT, ...(subRow.items || []).map(minStackedHeight)),
        0
      )
    : STACKED_MIN_ITEM_HEIGHT;

// Height for one item once its row has stacked vertically: the row height split
// by the item's width share, floored, so a [3,3,3,3] small KPI row stacks to four
// 160px tiles rather than four 256px ones, matching how nested containers divide
// their slot (VIS-1458 L3).
const stackedItemHeight = (items, item, rowPixelHeight) => {
  const totalWidth = items.reduce((sum, i) => sum + spanOf(i), 0) || 1;
  return Math.max(Math.round(rowPixelHeight * (spanOf(item) / totalWidth)), minStackedHeight(item));
};

// A top-level row that stacks on a phone has no fixed height, so an item in a
// medium or taller row keeps the whole row height: a third of 396px leaves a
// chart about 40px of plot once its margins are taken. Shorter rows (KPI
// strips) keep the width-share split (VIS-1520).
const topLevelStackedHeight = (items, item, rowPixelHeight) =>
  rowPixelHeight >= HEIGHT_PX.medium
    ? Math.max(rowPixelHeight, minStackedHeight(item))
    : stackedItemHeight(items, item, rowPixelHeight);

// Shared with the slot's accessible name (WCAG 2.5.3, Label in Name).
export const EMPTY_SLOT_LABEL = 'Empty slot — click to choose';

// `row.0.item.2` -> "row 1, item 3"; '' when the path is absent or unparseable.
export const describeSlotPath = itemPath => {
  const tokens = String(itemPath || '').split('.');
  const parts = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const axis = tokens[i];
    const index = Number(tokens[i + 1]);
    if ((axis !== 'row' && axis !== 'item') || !Number.isInteger(index)) return '';
    parts.push(`${axis} ${index + 1}`);
  }
  return parts.join(', ');
};

/**
 * Normalize a chart/table `insights` array so Chart/Table always receive
 * `[{ name: 'insight-name' }]` objects rather than raw context-string refs
 * (`"${ref(insight-name)}"`).
 *
 * Chart.jsx derives the insight names it loads via `chart.insights.map(i => i.name)`.
 * When the dashboard comes from the `/api/dashboards/` store endpoint (the path
 * used by both Project and the Workspace canvas, via <Dashboard>), embedded
 * chart objects carry their `insights` as un-resolved string refs. Without this
 * normalization `i.name` is `undefined`, no insight data is ever matched, and the
 * chart spins forever (VIS-827). The old `project_json` route pre-resolves insights
 * into objects, which is why that route was unaffected.
 *
 * Returns a new config object (never mutates the store's object) when insights
 * are present; otherwise returns the config unchanged.
 */
const normalizeInsightRefs = config => {
  if (!config || !Array.isArray(config.insights)) return config;
  return {
    ...config,
    insights: config.insights.map(insight => {
      if (typeof insight === 'string') {
        return { name: parseRefValue(insight) };
      }
      return insight; // Already an object (may carry name/props/interactions)
    }),
  };
};

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
    return normalizeInsightRefs(config);
  }

  // Legacy/embedded: the chart/table object lives inline in the dashboard row.
  // Its `insights` are still un-resolved string refs from the API, so normalize
  // them the same way as the string-ref branch above (VIS-827).
  return normalizeInsightRefs(itemRef);
};

/**
 * Collect all insight names from visible rows for centralized prefetching.
 */
const isModelData = data => data && (data.sql || data.args || data.models);

/**
 * Resolve a table's `data` ref into a `{ name, isModel }` classification used to
 * route the name into the right prefetch bucket (insightNames vs modelNames).
 *
 * A table's `data` can be (per the Table Pydantic model) a ${ ref() } to EITHER
 * a model OR an insight, and it arrives from the `/api/tables/` store endpoint in
 * one of two shapes:
 *   - a STRING context-ref ("${ref(wide-columns-table)}") — the common case, and
 *     the one that regressed (VIS-827). The string alone carries no model/insight
 *     signal, so we consult the model registry: a name that is a known model is
 *     model-data; otherwise it's treated as an insight (preserving the prior
 *     behavior for insight-backed simple tables).
 *   - an OBJECT carrying `name` + `sql|args|models` (an embedded/inlined model
 *     definition) — classified directly via isModelData().
 *
 * Returns null when no data name can be derived.
 */
const classifyTableData = (tableData, isKnownModel) => {
  if (!tableData) return null;
  if (typeof tableData === 'string') {
    const name = parseRefValue(tableData);
    if (!name) return null;
    return { name, isModel: isKnownModel(name) };
  }
  const name = tableData?.name;
  if (!name) return null;
  return { name, isModel: isModelData(tableData) };
};

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

const collectDataNames = (rows, visibleRowIndices, shouldShowItem, getChartByName, getTableByName, knownInsightNames = new Set(), isKnownModel = () => false) => {
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
      // A string-ref `data` (the common case) carries no model/insight signal on
      // its own; classifyTableData consults the model registry so model-data
      // tables route into modelNames (VIS-827). Previously every string ref fell
      // into insightNames, so useModelsData never fetched the model and the table
      // spun forever.
      const classified = classifyTableData(table.data, isKnownModel);
      if (classified) {
        (classified.isModel ? modelNames : insightNames).add(classified.name);
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
 * Dashboard - Renders a single dashboard using data from stores
 * Shows draft versions of objects merged with published versions
 */
const Dashboard = ({
  projectId,
  dashboardName,
  eagerLoad = true,
  stackBreakpoint = 1024,
  // When true, suppress the default "This dashboard is empty" placeholder so a
  // build-surface overlay (the canvas's D-8 "+ Add Row" CTA) can own the empty
  // state instead. The dashboard root still mounts so the overlay's measuring
  // ancestor exists. (VIS-794)
  hideEmptyPlaceholder = false,
  // When true (canvas build surface only), render a visible placeholder for an
  // EMPTY item slot (no chart/table/markdown/input/rows) so users can see — and
  // drop onto — an otherwise-invisible empty slot. View mode keeps the legacy
  // behaviour (an empty slot renders nothing). (VIS-901 #3)
  canvasMode = false,
  // Optional broken-reference renderer (VIS-792 / Track L L-1). When a leaf's
  // chart/table/markdown/input ref doesn't resolve, the renderer calls this with
  // `({ type, name, itemPath })` so the canvas can mount an interactive
  // <BrokenRefCard> (Fix… / Delete this slot). When absent (View mode), the
  // renderer falls back to the legacy "<Type> not found: <name>" placeholder so
  // static viewing stays at parity.
  renderBrokenRef = null,
  // Canvas only: makes the empty-slot placeholder a button calling `({ itemPath })`.
  onEmptySlotClick = null,
}) => {
  // Dashboard store (fetched by Project container)
  const dashboards = useStore(state => state.dashboards);

  // Chart store
  const fetchCharts = useStore(state => state.fetchCharts);
  const charts = useStore(state => state.charts);
  const getChartByName = useStore(state => state.getChartByName);

  // Table store
  const fetchTables = useStore(state => state.fetchTables);
  const tables = useStore(state => state.tables);
  const getTableByName = useStore(state => state.getTableByName);

  // Model registry — used to classify a table's `data` string ref as model-data
  // vs insight-data so model-backed tables get fetched via useModelsData (VIS-827).
  // The /api/tables/ store hands `data` to us as a bare context-ref string with no
  // model/insight signal, so we look the name up against the fetched model list.
  const fetchModels = useStore(state => state.fetchModels);
  const models = useStore(state => state.models);

  // Markdown store
  const fetchMarkdowns = useStore(state => state.fetchMarkdowns);
  const markdowns = useStore(state => state.markdowns);
  const getMarkdownByName = useStore(state => state.getMarkdownByName);

  // Input store
  const fetchInputs = useStore(state => state.fetchInputs);
  const inputs = useStore(state => state.inputs);
  const getInputByName = useStore(state => state.getInputByName);

  // Insight configs — the /project route doesn't otherwise load them, but Chart
  // reads the live authored `type` from here so a config-only edit renders
  // without a run (VIS-1023). Optional so older/other shells that don't provide
  // the slice don't break.
  const fetchInsights = useStore(state => state.fetchInsights);
  // Bumped by the run poller when a draft run succeeds; threaded into the data
  // hooks as a cacheKey so they refetch + force-reload the rebuilt output.
  const runDataVersion = useStore(state => state.runDataVersion);

  // Viewport-based loading: Track which rows are visible
  const { visibleRows, setRowRef } = useVisibleRows(dashboardName);

  // Responsive width tracking
  const { observe, width } = useDimensions({
    onResize: ({ observe }) => {
      observe();
    },
  });

  // Stacking breakpoint. `width` is CONTAINER-relative — it comes from the
  // ResizeObserver (`observe`) attached to the dashboard root div below, NOT
  // the viewport. It is PER-SURFACE (VIS-829): static viewing (/project-new and,
  // once VIS-833 lands, /project) keeps the default 1024 so rows stack earlier
  // for readability on genuinely narrow windows; the Workspace canvas passes
  // `stackBreakpoint` (via ProjectCanvas) at a phone-width pane, because the
  // canvas pane is ~700px on a desktop viewport and the default would collapse
  // every row into one column. The
  // threshold is applied per-container (top-level + each nested slot) via
  // `shouldStack`, so nesting decisions stay slot-relative.
  const widthBreakpoint = stackBreakpoint;

  // Decide whether a container of `containerWidth` pixels should stack its items
  // vertically. Falls back to the dashboard width when no explicit slot width is
  // provided (top-level rows). A nested slot that is only a fraction of the
  // dashboard width can stack independently of its (wider) parent.
  // A zero/absent width is the pre-measurement state (`useDimensions` reports
  // null, then possibly a 0 entry, until its ResizeObserver has measured), not a
  // narrow container: committing a
  // stacked layout from it painted a wide dashboard as a column and let Plotly
  // size itself against that column before the real width arrived (VIS-1459 /
  // L6). Treat unmeasured as "not stacked" and let the measured width decide.
  const shouldStack = containerWidth => {
    const effective =
      typeof containerWidth === 'number' && containerWidth > 0 ? containerWidth : width;
    if (!(effective > 0)) return false;
    return effective < widthBreakpoint;
  };

  const isColumn = shouldStack(width);

  // Fetch item data on mount (dashboards fetched by Project container).
  // `fetchModels` populates the model registry consumed by `isKnownModel` below;
  // the Workspace canvas already fetches it (via Workspace.jsx), but the /project
  // View route does not, so Dashboard fetches it itself to classify model-data
  // tables correctly on both surfaces (VIS-827).
  useEffect(() => {
    fetchCharts();
    fetchTables();
    fetchMarkdowns();
    fetchInputs();
    fetchModels();
    fetchInsights?.();
  }, [fetchCharts, fetchTables, fetchMarkdowns, fetchInputs, fetchModels, fetchInsights]);

  // Stable membership test against the fetched model registry. A name not present
  // in the registry is treated as a non-model (insight), preserving the prior
  // behavior for insight-backed simple tables.
  const modelNameSet = useMemo(
    () => new Set((models || []).map(m => m.name)),
    [models]
  );
  const isKnownModel = useCallback(name => modelNameSet.has(name), [modelNameSet]);

  // Find the current dashboard and extract its config
  const dashboard = useMemo(() => {
    const dashboardData = dashboards?.find(d => d.name === dashboardName);
    if (!dashboardData) return null;

    // Dashboard data from API has rows in config field
    return dashboardData.config || dashboardData;
  }, [dashboards, dashboardName]);

  // A template dashboard names its items in HTML rather than listing them in
  // rows. Each slot becomes a grid item so the prefetch and render paths below
  // serve both kinds of dashboard.
  const templateHtml = typeof dashboard?.template === 'string' ? dashboard.template : null;
  const preparedTemplate = useMemo(
    () => (templateHtml === null ? null : prepareTemplate(templateHtml)),
    [templateHtml]
  );

  const templateItemFor = useCallback(
    name => {
      if (getChartByName(name)) return { chart: name };
      if (getTableByName(name)) return { table: name };
      if (getMarkdownByName(name)) return { markdown: name };
      if (getInputByName(name)) return { input: name };
      return null;
    },
    // The getters are stable; the lists they read are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getChartByName, getTableByName, getMarkdownByName, getInputByName, charts, tables, markdowns, inputs]
  );

  const layoutRows = useMemo(() => {
    if (!preparedTemplate) return dashboard?.rows;
    const items = preparedTemplate.slots.map(slot => templateItemFor(slot.name)).filter(Boolean);
    return [{ items }];
  }, [preparedTemplate, templateItemFor, dashboard?.rows]);

  // Height calculation helpers.
  // `Row.height` accepts either an enum token (compact|xsmall|...|xxlarge) or a
  // positive integer pixel value (canvas's Shift-modifier fluid-resize gesture
  // writes ints directly to the same field). See VIS-A1 / specs §5.6.
  const getHeight = height => {
    if (typeof height === 'number') return height;
    if (height === 'compact') return COMPACT_PLOT_HEIGHT;
    return HEIGHT_PX[height] ?? HEIGHT_PX.xxlarge;
  };

  // Relative-weight mapping for sub-rows nested inside an Item's `rows` field.
  // When a Row appears at the top level its `height` is interpreted as absolute
  // pixels via getHeight() above. When nested inside an Item, the same value
  // becomes a relative weight that divides the parent slot's height.
  const heightToWeight = height => {
    if (typeof height === 'number' && height > 0) return height / WEIGHT_PX;
    return HEIGHT_WEIGHT[height] ?? HEIGHT_WEIGHT.medium;
  };

  // Compute the pixel width an item should use for chart/table sizing.
  // `containerPixelWidth` is the pixel width of the row this item lives in —
  // the dashboard's measured width at the top level, but the item's parent
  // slot inside a nested row-container. Without this, nested charts size
  // themselves to the dashboard width and overflow their slot, which then
  // collapses sibling grid tracks (CSS grid resolves min-content overflow
  // by stealing track width from siblings).
  // `stacked` is the caller's own stacking decision (top-level `isColumn` or a
  // nested row's slot-relative rule); when omitted, fall back to the breakpoint.
  // Returns `undefined` while nothing has been measured yet so leaves fall back
  // to Plotly's own autosize against the live container (and its container
  // ResizeObserver re-measures once the box settles) instead of being told a
  // width of 0/null, which Plotly resolves to its PREVIOUS width — the
  // "chart a third of its card" first paint (VIS-1459 / L6).
  const getWidth = (items, item, containerPixelWidth, stacked) => {
    const containerWidth =
      typeof containerPixelWidth === 'number' && containerPixelWidth > 0
        ? containerPixelWidth
        : width;
    if (!(typeof containerWidth === 'number' && containerWidth > 0)) {
      return undefined;
    }
    const isStacked = typeof stacked === 'boolean' ? stacked : containerWidth < widthBreakpoint;
    if (isStacked) {
      return containerWidth;
    }
    const totalWidth = items.reduce((sum, i) => sum + spanOf(i), 0) || 1;
    return containerWidth * (spanOf(item) / totalWidth);
  };

  // Item visibility logic (no selector support needed)
  const shouldShowItem = useCallback(() => true, []);

  // Least height a row-container needs at `slotWidth` so every sub-row that
  // stacks still gives each of its items the stacked floor; 0 for a leaf.
  const minContainerHeight = (item, slotWidth) => {
    if (!item?.rows?.length) return 0;
    const totalWeight = item.rows.reduce((sum, r) => sum + heightToWeight(r.height), 0);
    const subRowNeeds = item.rows.map(
      subRow => (minSubRowHeight(subRow, slotWidth) * totalWeight) / heightToWeight(subRow.height)
    );
    return Math.ceil(NESTED_GAP_PX * (item.rows.length - 1) + Math.max(...subRowNeeds));
  };

  const minSubRowHeight = (subRow, slotWidth) => {
    const items = (subRow.items || []).filter(shouldShowItem);
    const stacked = shouldStackNested(slotWidth, items);
    const nestedNeeds = items.map(i => minContainerHeight(i, getWidth(items, i, slotWidth, stacked)));
    if (!stacked) return Math.max(0, ...nestedNeeds);
    const totalSpan = items.reduce((sum, i) => sum + spanOf(i), 0);
    const itemNeeds = items.map(
      (i, idx) => (Math.max(minStackedHeight(i), nestedNeeds[idx]) * totalSpan) / spanOf(i)
    );
    return NESTED_GAP_PX * (items.length - 1) + Math.max(...itemNeeds);
  };

  // Centralized input prefetching - fetch for ALL rows (optimize later)
  const visibleInputNames = useMemo(() => {
    if (!layoutRows) return [];
    const allRowIndices = layoutRows.map((_, idx) => idx);
    return collectInputNames(layoutRows, allRowIndices, shouldShowItem);
  }, [layoutRows, shouldShowItem]);

  const knownInsightNames = useMemo(() => {
    const names = new Set();
    forEachItemDeep(layoutRows, item => {
      const chart = resolveItem(item.chart, getChartByName);
      chart?.insights?.forEach(i => {
        const n = typeof i === 'string' ? parseRefValue(i) : i?.name;
        if (n) names.add(n);
      });
      const table = resolveItem(item.table, getTableByName);
      if (table?.data) {
        // Only insight-classified table data contributes to the known-insight set
        // used to disambiguate pivot refs; model-data tables (string ref to a
        // known model, or embedded sql/args/models) must NOT be treated as
        // insights (VIS-827).
        const classified = classifyTableData(table.data, isKnownModel);
        if (classified && !classified.isModel) {
          names.add(classified.name);
        }
      }
    });
    return names;
  }, [layoutRows, getChartByName, getTableByName, isKnownModel]);

  const { visibleInsightNames, visibleModelNames } = useMemo(() => {
    if (!layoutRows) return { visibleInsightNames: [], visibleModelNames: [] };
    const allRowIndices = layoutRows.map((_, idx) => idx);
    const { insightNames, modelNames } = collectDataNames(
      layoutRows,
      allRowIndices,
      shouldShowItem,
      getChartByName,
      getTableByName,
      knownInsightNames,
      isKnownModel
    );
    return { visibleInsightNames: insightNames, visibleModelNames: modelNames };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutRows, charts, tables, models, getChartByName, getTableByName, shouldShowItem, knownInsightNames, isKnownModel]);

  // Inputs an insight DEPENDS ON (referenced via `${input.value}` inside its
  // query / static_props) must be prefetched too. Otherwise an input-driven
  // chart added to a dashboard that carries no input WIDGET for that input never
  // gets the input's options/default loaded, so the insight stays
  // `pendingInputs` and its tile spins forever. useInsightsData publishes the
  // per-insight dependency list into `insightJobs[name].inputDependencies` (and
  // `pendingInputs` while still waiting); union them across the visible insights
  // and prefetch alongside the widget inputs.
  const insightJobs = useStore(state => state.insightJobs);
  const insightInputNames = useMemo(() => {
    const names = new Set();
    visibleInsightNames.forEach(name => {
      const job = insightJobs?.[name];
      if (!job) return;
      (job.inputDependencies || []).forEach(n => names.add(n));
      (job.pendingInputs || []).forEach(n => names.add(n));
    });
    return [...names];
  }, [insightJobs, visibleInsightNames]);

  const allInputNames = useMemo(
    () => [...new Set([...visibleInputNames, ...insightInputNames])],
    [visibleInputNames, insightInputNames]
  );

  // Serialised so the order keeps its identity while unrelated insight jobs update.
  const seriesOrderKey = useMemo(() => {
    const tracesPerChart = [];
    forEachItemDeep(layoutRows, item => {
      const chart = resolveItem(item.chart, getChartByName);
      if (!chart?.insights?.length) return;
      const chartJobs = {};
      chart.insights.forEach(insight => {
        const job = insightJobs?.[insight?.name];
        if (job) chartJobs[insight.name] = job;
      });
      tracesPerChart.push(chartDataFromInsightData(chartJobs));
    });
    return JSON.stringify(seriesOrderOf(tracesPerChart));
  }, [layoutRows, getChartByName, insightJobs]);
  const seriesOrder = useMemo(() => JSON.parse(seriesOrderKey), [seriesOrderKey]);

  useInputsData(projectId, allInputNames, { cacheKey: runDataVersion });
  useInsightsData(projectId, visibleInsightNames, undefined, { cacheKey: runDataVersion });
  useModelsData(projectId, visibleModelNames, undefined, { cacheKey: runDataVersion });

  // Render a dashboard item.
  // `slotPixelHeight` is the pixel height the parent row reserved for this slot;
  // it's used to size the chart/table inside the slot AND to size sub-rows when
  // the item is a row-container. `keyPrefix` namespaces children when the item
  // is being rendered inside a nested-rows context (so React keys stay unique
  // across multiple flips of the same dashboard).
  // `parentStacked` is whether the row this item sits in is laid out as a column;
  // it drives the slot width (a stacked item spans the whole row).
  const renderItem = (item, row, itemIndex, rowIndex, shouldLoad, items, slotPixelHeight, slotPixelWidth, keyPrefix = '', itemPath = '', parentStacked) => {
    const key = `${keyPrefix}dashboardRow${rowIndex}Item${itemIndex}`;

    // Pixel width this item slot was given by its parent row. Used for chart
    // sizing on leaves AND threaded down into nested rows so nested charts
    // size from the slot, not the dashboard.
    const effectiveSlotWidth = getWidth(items, item, slotPixelWidth, parentStacked);

    // Render the placeholder for a leaf whose reference doesn't resolve. The
    // canvas passes `renderBrokenRef` to mount the interactive <BrokenRefCard>
    // (VIS-792 / L-1); View mode falls back to the legacy inline text so static
    // viewing stays at parity.
    const brokenRef = (type, rawRef) => {
      const name = typeof rawRef === 'string' ? parseRefValue(rawRef) || rawRef : 'unknown';
      if (typeof renderBrokenRef === 'function') {
        return (
          <div key={key} className="h-full w-full">
            {renderBrokenRef({ type, name, itemPath })}
          </div>
        );
      }
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      return (
        <div key={key} className="flex items-center justify-center h-full text-gray-500 text-sm">
          {label} not found: {typeof rawRef === 'string' ? rawRef : 'unknown'}
        </div>
      );
    };

    // Row-container item: render nested rows as a vertical flex stack with
    // weight-based heights (see Q9 — sub-row heights are relative weights inside
    // the parent slot, not absolute pixels).
    if (item.rows && item.rows.length > 0) {
      const subRows = item.rows;
      const totalWeight = subRows.reduce(
        (sum, r) => sum + heightToWeight(r.height), 0
      ) || 1;
      const parentPixelHeight = Math.max(
        typeof slotPixelHeight === 'number' && slotPixelHeight > 0
          ? slotPixelHeight
          : getHeight(row.height),
        minContainerHeight(item, effectiveSlotWidth)
      );
      return (
        <div
          key={key}
          className="dashboard-nested-rows flex flex-col w-full h-full"
          data-testid="dashboard-nested-rows"
          // Floor the container at its intended pixel height. In GRID (side-by-
          // side) mode the row has an explicit height, so the grid cell stretches
          // and `h-full` already resolves correctly (≥ this floor, no change). In
          // STACKED/column mode the row has NO definite height, so `h-full`
          // (a percentage of a content-driven parent) collapses to 0 and every
          // nested sub-row/leaf renders at 0px. The minHeight gives the flex
          // column a definite height to distribute, fixing the collapse without
          // touching the working grid path. (VIS-829-adjacent: stacked-mode
          // nested-container height; affects /project View mode at narrow widths
          // too, since Dashboard is the shared renderer.)
          style={{ gap: '0.5rem', minWidth: 0, minHeight: parentPixelHeight || 0 }}
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
                {renderNestedRow(subRow, subIdx, itemIndex, rowIndex, shouldLoad, subHeightPx, effectiveSlotWidth, `${key}-sub-${subIdx}-`, itemPath)}
              </div>
            );
          })}
        </div>
      );
    }

    if (item.input) {
      const input = resolveItem(item.input, getInputByName);
      if (!input) {
        return brokenRef('input', item.input);
      }
      return (
        <Input
          key={key}
          input={input}
          projectId={projectId}
          itemWidth={spanOf(item)}
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
        return brokenRef('chart', item.chart);
      }
      return (
        <Chart
          key={key}
          chart={chart}
          projectId={projectId}
          height={effectiveSlotHeight - 8}
          width={effectiveSlotWidth}
          itemWidth={spanOf(item)}
          shouldLoad={shouldLoad}
          seriesOrder={seriesOrder}
        />
      );
    }

    if (item.table) {
      const table = resolveItem(item.table, getTableByName);
      if (!table) {
        return brokenRef('table', item.table);
      }
      return (
        <Table
          key={key}
          table={table}
          projectId={projectId}
          itemWidth={spanOf(item)}
          width={effectiveSlotWidth}
          height={effectiveSlotHeight}
          shouldLoad={shouldLoad}
        />
      );
    }

    if (item.markdown) {
      const markdown = resolveItem(item.markdown, getMarkdownByName);
      if (!markdown) {
        return brokenRef('markdown', item.markdown);
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

    // Empty layout slot ({ width } with no leaf ref / rows). In View mode this
    // renders nothing (parity preserved); on the canvas build surface we paint a
    // visible dashed placeholder so the slot is discoverable + a drop target
    // (VIS-901 #3). Backend persistence of a truly-empty item lands with VIS-900.
    if (canvasMode) {
      if (typeof onEmptySlotClick === 'function') {
        // The location suffix tells apart the identical slots a row template paints.
        const slotLocation = describeSlotPath(itemPath);
        return (
          <button
            key={key}
            type="button"
            data-testid="canvas-empty-slot"
            aria-label={slotLocation ? `${EMPTY_SLOT_LABEL} (${slotLocation})` : undefined}
            onClick={() => onEmptySlotClick({ itemPath })}
            className="flex h-full w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/40 text-[11px] font-medium text-gray-400 transition-colors hover:border-primary-300 hover:bg-primary-50/40 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            style={{ minHeight: 48 }}
          >
            {EMPTY_SLOT_LABEL}
          </button>
        );
      }
      return (
        <div
          key={key}
          data-testid="canvas-empty-slot"
          className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/40 text-[11px] font-medium text-gray-400"
          style={{ minHeight: 48 }}
        >
          Empty slot
        </div>
      );
    }

    return null;
  };

  // Render a sub-row that lives inside an Item's `rows` field. Same grid layout
  // as a top-level row, but height is governed by the parent slot's flex
  // allocation rather than the row's pixel-mapped HeightEnum. Reuses renderItem
  // so leaf-vs-row-container handling is shared with the top level.
  const renderNestedRow = (subRow, subRowIndex, parentItemIndex, parentRowIndex, shouldLoad, slotPixelHeight, slotPixelWidth, keyPrefix, parentItemPath = '') => {
    if (!subRow || !subRow.items) return null;
    const visibleItems = subRow.items.filter(shouldShowItem);
    const totalWidth = visibleItems.reduce((sum, item) => sum + spanOf(item), 0) || 1;
    // Composite selection path (VIS-768): mirrors OutlineTreePanel's recursive
    // key scheme `row.<ri>.item.<ii>[.row.<ri>.item.<ii>]…` so the canvas overlay
    // and Outline tree share ONE selection key at any nesting depth.
    const subRowPath = parentItemPath
      ? `${parentItemPath}.row.${subRowIndex}`
      : `row.${subRowIndex}`;
    // Slot-relative stacking: a nested row only occupies its parent slot's
    // width, not the full dashboard. VIS-829 compared the slot width against the
    // dashboard-wide breakpoint, which stacked every nested multi-item row whose
    // slot was under 768/1024px — i.e. any nested 2x2 on a normal screen
    // (VIS-1459 / L2). Decide from the narrowest item the slot would produce
    // instead (see shouldStackNested), so each nested container stacks on its
    // own terms.
    const nestedIsColumn = shouldStackNested(slotPixelWidth, visibleItems);
    // Stacked sub-row items split the sub-row's height (minus the 0.5rem gaps)
    // rather than each claiming the full sub-row height and overflowing.
    // Each item takes its width share of what is left, floored at
    // STACKED_MIN_ITEM_HEIGHT so a KPI tile keeps a plot area (VIS-1458 L3).
    const stackedSlotHeight =
      typeof slotPixelHeight === 'number'
        ? slotPixelHeight - NESTED_GAP_PX * (visibleItems.length - 1)
        : slotPixelHeight;
    const itemPixelHeightOf = item =>
      nestedIsColumn && visibleItems.length > 1 && typeof slotPixelHeight === 'number'
        ? stackedItemHeight(visibleItems, item, stackedSlotHeight)
        : slotPixelHeight;
    return (
      <div
        className={`dashboard-nested-row w-full h-full ${nestedIsColumn ? 'flex' : 'grid'}`}
        data-testid="dashboard-nested-row"
        data-canvas-path={subRowPath}
        style={{
          display: nestedIsColumn ? 'flex' : 'grid',
          flexDirection: nestedIsColumn ? 'column' : undefined,
          gridTemplateColumns: nestedIsColumn ? undefined : `repeat(${totalWidth}, minmax(0, 1fr))`,
          gap: '0.5rem',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {visibleItems.map((item, itemIdx) => (
          <div
            key={`${keyPrefix}item-${itemIdx}`}
            // Composite selection anchor (VIS-768): nested item slots carry their
            // full path so a click at any depth resolves to the exact leaf the
            // Outline tree would, and an Outline→canvas selection rings it.
            data-canvas-path={`${subRowPath}.item.${itemIdx}`}
            data-testid="dashboard-nested-item"
            className={nestedIsColumn ? 'w-full max-w-full min-w-0' : 'min-w-0 overflow-hidden'}
            style={{
              gridColumn: nestedIsColumn ? undefined : `span ${spanOf(item)}`,
              width: nestedIsColumn ? '100%' : 'auto',
              height: nestedIsColumn && itemPixelHeightOf(item) > 0 ? itemPixelHeightOf(item) : undefined,
              flex: nestedIsColumn ? '1 1 0' : undefined,
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
                itemPixelHeightOf(item),
                slotPixelWidth,
                keyPrefix,
                `${subRowPath}.item.${itemIdx}`,
                nestedIsColumn,
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
    const totalWidth = visibleItems.reduce((sum, item) => sum + spanOf(item), 0) || 1;
    const isCompact = row.height === 'compact';
    const gridRowHeight = Math.max(
      getHeight(row.height),
      ...visibleItems.map(item => minContainerHeight(item, getWidth(visibleItems, item, width, false)))
    );
    const rowStyle = isColumn || isCompact ? {} : { height: gridRowHeight };
    // Compact rows size to content; otherwise a stacked item gets its share of
    // the row height and a grid item gets the whole row.
    const slotHeightFor = item => {
      if (isCompact) return undefined;
      return isColumn ? topLevelStackedHeight(visibleItems, item, getHeight(row.height)) : gridRowHeight;
    };
    // VIS-827: eager-load by default. The row-visibility lazy-loader
    // (useVisibleRows) relies on an IntersectionObserver that does not fire
    // inside the Workspace canvas's inner overflow-auto scroll container, so
    // rows past the initial seed never become "visible" and their charts spin
    // forever even though the insight data is already in the store. Eager-loading
    // the new renderer renders every row; callers can pass eagerLoad={false} to
    // opt back into lazy loading once the observer is wired to the scroll root.
    const shouldLoad = eagerLoad || visibleRows.has(rowIndex);

    return (
      <div
        key={`row-${rowIndex}`}
        ref={el => setRowRef(el, rowIndex)}
        data-row-index={rowIndex}
        data-canvas-path={`row.${rowIndex}`}
        data-testid={`dashboard-row-${rowIndex}`}
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
          gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, minmax(0, 1fr))`,
          gap: '0.7rem',
          minWidth: 0,
          ...rowStyle,
        }}
      >
        {visibleItems.map((item, itemIndex) => (
          <div
            key={`item-${rowIndex}-${itemIndex}`}
            // Additive selection anchors consumed by the Workspace canvas's
            // overlay layer (VIS-768). These data attributes are inert in View
            // mode and keep Dashboard's render at parity — the overlay reads
            // them via event delegation + getBoundingClientRect to place
            // hover/selection rings, never mutating this render. `data-canvas-path`
            // is the composite key (matches OutlineTreePanel) the overlay resolves
            // in both directions; `data-canvas-item-index` is kept for back-compat.
            data-canvas-item-index={itemIndex}
            data-canvas-path={`row.${rowIndex}.item.${itemIndex}`}
            className={isColumn ? 'w-full max-w-full min-w-0' : 'min-w-0 overflow-hidden'}
            style={{
              gridColumn: isColumn ? undefined : `span ${spanOf(item)}`,
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
            <div className="flex items-center h-full w-full max-w-full min-w-0">
              {renderItem(
                item,
                row,
                itemIndex,
                rowIndex,
                shouldLoad,
                visibleItems,
                slotHeightFor(item),
                width, // top-level container width = dashboard width
                '', // keyPrefix (top level needs none)
                `row.${rowIndex}.item.${itemIndex}`,
                isColumn,
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

  if (preparedTemplate) {
    return (
      <TemplateDashboard
        dashboardName={dashboardName}
        prepared={preparedTemplate}
        renderItem={(slot, { width: slotWidth, height: slotHeight }) => {
          const item = templateItemFor(slot.name);
          if (!item) {
            return (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                Not found: {slot.name}
              </div>
            );
          }
          return renderItem(item, TEMPLATE_ROW, 0, 0, true, [item], slotHeight, slotWidth, `${slot.slotName}-`);
        }}
      />
    );
  }

  // Empty dashboard state
  if (!dashboard.rows || dashboard.rows.length === 0) {
    if (hideEmptyPlaceholder) {
      // The canvas overlay (CanvasAddRow) renders the D-8 CTA on top; still
      // mount a positioned, full-size root so the overlay has an ancestor to
      // measure against and fill.
      return (
        <div
          ref={observe}
          data-testid={`dashboard_${dashboardName}`}
          data-dashboard-empty="true"
          className="flex grow flex-col w-full max-w-full"
        />
      );
    }
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
      // canvasMode isolates the render so a hovered card's z-40 cannot rise
      // above the canvas overlays and cover the selected card's drag frame.
      className={`flex grow flex-col justify-items-stretch w-full max-w-full overflow-x-clip px-6 pb-8${
        canvasMode ? ' isolate' : ''
      }`}
    >
      {dashboard.rows.map(renderRow)}
    </div>
  );
};

export default Dashboard;
