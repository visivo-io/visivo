import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { PiCaretUp, PiCaretDown, PiCode, PiChartBar } from 'react-icons/pi';
import SQLEditor from './SQLEditor';
import DataTable from '../common/DataTable';
import ColumnProfilePanel from './ColumnProfilePanel';
import ExplorerChartPreview from './ExplorerChartPreview';
import ExplorerErrorBoundary from './ExplorerErrorBoundary';
import ExplorerInputsToolbar from './ExplorerInputsToolbar';
import DataSectionToolbar from './DataSectionToolbar';
import DraggableColumnHeader from './DraggableColumnHeader';
import VerticalDivider from '../common/VerticalDivider';
import Divider from '../common/Divider';
import Select from '../common/Select';
import useStore from '../../stores/store';
import {
  selectActiveModelSql,
  selectActiveModelSourceName,
  selectActiveModelQueryResult,
  selectActiveModelQueryError,
  selectActiveModelComputedColumns,
  selectActiveModelEnrichedResult,
} from '../../stores/explorerStore';
import { inferColumnTypes } from '../../utils/inferColumnTypes';
import { computeColumnProfile } from '../../utils/computeColumnProfile';
import { usePanelResize } from '../../hooks/usePanelResize';
import useExplorerDuckDB from '../../hooks/useExplorerDuckDB';

const NARROW_THRESHOLD = 600;

// 6c-T2 (audit cold-start #7 / shell-ia — "editor consumes ~440px of dark
// dead space for a one-line query"): the SQL editor's row auto-sizes to its
// LINE COUNT (same `(lines + 2) * 19` formula ModelEditForm already uses for
// its Monaco instance) instead of always claiming a fixed 65% ratio of the
// pane's height. `EDITOR_AUTO_MAX_HEIGHT` caps a long query from eating the
// whole pane; `CHART_MIN_HEIGHT` floors the row so the chart preview beside
// the editor (wide mode) is never crushed by a trivially short query.
const EDITOR_AUTO_MIN_HEIGHT = 120;
const EDITOR_AUTO_MAX_HEIGHT = 420;
const CHART_MIN_HEIGHT = 260;

const CenterPanel = ({
  // Explore 2.0 Phase 3a/3b: the exploration surface (`ExplorationWorkbench`)
  // is CenterPanel's only remaining consumer post-cutover (the standalone
  // `/explorer` route + its horizontal `ModelTabBar` are retired) — it always
  // passes `<ExplorationQueryChips/>` here. The prop stays optional (rather
  // than hardcoding the import) so CenterPanel doesn't hardcode a dependency
  // on the exploration surface's own chip component.
  modelTabBar = null,
  // Explore 2.0 Phase 3a (D9): opts the SQL editor into being a Library
  // column/table drop target. Default false.
  enableLibraryDrop = false,
}) => {
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const sourceName = useStore(selectActiveModelSourceName);
  const setSourceName = useStore((s) => s.setActiveModelSource);
  const explorerSources = useStore((s) => s.explorerSources);
  const sql = useStore(selectActiveModelSql);
  const setSql = useStore((s) => s.setActiveModelSql);
  const queryResult = useStore(selectActiveModelQueryResult);
  const queryError = useStore(selectActiveModelQueryError);
  const setModelQueryResult = useStore((s) => s.setModelQueryResult);
  const setModelQueryError = useStore((s) => s.setModelQueryError);
  const isEditorCollapsed = useStore((s) => s.explorerIsEditorCollapsed);
  const toggleEditorCollapsed = useStore((s) => s.toggleExplorerEditorCollapsed);
  const profileColumn = useStore((s) => s.explorerProfileColumn);
  const setProfileColumn = useStore((s) => s.setExplorerProfileColumn);
  const centerMode = useStore((s) => s.explorerCenterMode);
  const setCenterMode = useStore((s) => s.setExplorerCenterMode);
  const enrichedResult = useStore(selectActiveModelEnrichedResult);
  const computedColumns = useStore(selectActiveModelComputedColumns);
  const failedComputedColumns = useStore((s) => s.explorerFailedComputedColumns);
  const projectId = useStore((s) => s.project?.id);

  // Initialize DuckDB integration for computed columns. The db handle and the
  // loaded explorer table feed the column-profile histogram.
  const { db: duckDb, currentTable: duckDbTable } = useExplorerDuckDB();

  const containerRef = useRef(null);
  const topRowRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Observe container width for responsive behavior
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isWide = containerWidth >= NARROW_THRESHOLD;

  // Horizontal split: editor <-> chart (wide mode only)
  const {
    ratio: editorChartRatio,
    isResizing: isHorizResizing,
    handleMouseDown: handleHorizMouseDown,
  } = usePanelResize({
    containerRef: topRowRef,
    direction: 'horizontal',
    initialRatio: 0.5,
    minSize: 200,
    maxRatio: 0.75,
    minRatio: 0.25,
  });

  // Vertical split: top <-> bottom. Stays available as a manual override —
  // once the user actually drags the divider, their ratio wins from then on
  // (`userAdjustedTopBottom`) — but the DEFAULT is content-based auto-height
  // (below), not this fixed 0.65 ratio.
  const {
    ratio: topBottomRatio,
    isResizing: isVertResizing,
    handleMouseDown: handleVertMouseDown,
  } = usePanelResize({
    containerRef,
    direction: 'vertical',
    initialRatio: 0.65,
    minSize: 100,
    maxRatio: 0.85,
    minRatio: 0.25,
  });
  const [userAdjustedTopBottom, setUserAdjustedTopBottom] = useState(false);
  const handleVertMouseDownAndMarkAdjusted = useCallback(
    (e) => {
      setUserAdjustedTopBottom(true);
      handleVertMouseDown(e);
    },
    [handleVertMouseDown]
  );

  // Auto-height target for the top row (editor [+ chart in wide mode]) — see
  // the constants' docstring above. Narrow mode's Chart tab has no editor in
  // the row at all, so it keeps the ratio-based split (chart wants to fill
  // whatever space it's given, not size to "content").
  // `String.prototype.split` always returns at least one element — the
  // `|| 1` fallback this line used to carry was unreachable by language
  // guarantee, not by a contract another module could change.
  const sqlLineCount = (sql || '').split('\n').length;
  const topRowSharesChart = isWide;
  const useAutoTopHeight =
    !userAdjustedTopBottom && !isEditorCollapsed && !(!isWide && centerMode === 'chart');
  const autoTopHeightPx = Math.min(
    EDITOR_AUTO_MAX_HEIGHT,
    Math.max(topRowSharesChart ? CHART_MIN_HEIGHT : EDITOR_AUTO_MIN_HEIGHT, (sqlLineCount + 2) * 19)
  );

  // Fix Plotly resize when divider ratios (or the auto-height target) change
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    return () => cancelAnimationFrame(frame);
  }, [editorChartRatio, topBottomRatio, autoTopHeightPx, useAutoTopHeight]);

  const [resultsPage, setResultsPage] = useState(0);
  const [resultsPageSize, setResultsPageSize] = useState(1000);
  useEffect(() => {
    setResultsPage(0);
  }, [queryResult]);

  const handleQueryComplete = useCallback(
    ({ result, error, context }) => {
      // Deliver to the model tab that started the run (captured by SQLEditor
      // at execute time) — the user may have switched tabs mid-flight.
      const targetModel = context || activeModelName;
      if (result) {
        setModelQueryResult(targetModel, result);
      }
      if (error) {
        setModelQueryError(targetModel, error);
      }
    },
    [setModelQueryResult, setModelQueryError, activeModelName]
  );


  // Use enriched result (with computed columns) when available, otherwise base result
  const displayResult = enrichedResult || queryResult;
  const computedColumnNames = useMemo(
    () => new Set(enrichedResult?.computedColumnNames || []),
    [enrichedResult]
  );

  const computedColumnMap = useMemo(() => {
    const map = {};
    (computedColumns || []).forEach((c) => { map[c.name] = c.type; });
    return map;
  }, [computedColumns]);

  const dataTableColumns = useMemo(() => {
    if (!displayResult) return [];
    const cols = inferColumnTypes(displayResult.columns || [], displayResult.rows || []);
    return cols.map((col) => ({
      ...col,
      isComputed: computedColumnNames.has(col.name),
      computedType: computedColumnMap[col.name] || null,
      computedError: failedComputedColumns?.[col.name] || null,
    }));
  }, [displayResult, computedColumnNames, computedColumnMap, failedComputedColumns]);

  const tableRows = displayResult?.rows || [];
  const totalRowCount = displayResult?.row_count || tableRows.length;
  const pageCount = Math.ceil(tableRows.length / resultsPageSize);
  const paginatedRows = tableRows.slice(
    resultsPage * resultsPageSize,
    (resultsPage + 1) * resultsPageSize
  );

  const selectedColumnProfile = useMemo(() => {
    if (!profileColumn || !displayResult?.rows?.length) return null;
    const colDef = dataTableColumns.find((c) => c.name === profileColumn);
    if (!colDef) return null;
    return computeColumnProfile(profileColumn, colDef, displayResult.rows);
  }, [profileColumn, displayResult, dataTableColumns]);

  // Content-based auto-height (default) vs. the manual drag ratio (once the
  // user has actually dragged the divider) — see `useAutoTopHeight` above.
  const topRowStyle = useAutoTopHeight
    ? { flex: `0 0 ${autoTopHeightPx}px` }
    : { flex: topBottomRatio };
  const bottomRowStyle = useAutoTopHeight ? { flex: '1 1 auto' } : { flex: 1 - topBottomRatio };

  const sourceSelector = (
    <div data-testid="source-selector-wrapper" className="min-w-[140px]">
      <Select
        data-testid="source-selector"
        aria-label="Select source"
        size="sm"
        placeholder="Select source"
        value={sourceName || ''}
        options={explorerSources.map((s) => ({
          value: s.source_name,
          label: s.source_name,
        }))}
        onChange={(v) => setSourceName(v || null)}
      />
    </div>
  );

  const editorToggleButton = (
    <button
      type="button"
      onClick={toggleEditorCollapsed}
      className="p-1 text-secondary-400 hover:text-secondary-600 transition-colors"
      title={isEditorCollapsed ? 'Expand editor' : 'Collapse editor'}
      data-testid="toggle-editor"
    >
      {isEditorCollapsed ? <PiCaretDown size={14} /> : <PiCaretUp size={14} />}
    </button>
  );

  const renderEditorSection = () => (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="editor-section"
      data-onb-target="sql-editor"
    >
      {!isEditorCollapsed ? (
        <div className="flex-1 min-h-0">
          <SQLEditor
            sourceName={sourceName}
            initialValue={sql}
            onSave={setSql}
            height="100%"
            hideResults
            queryContext={activeModelName}
            onQueryComplete={handleQueryComplete}
            toolbarExtra={sourceSelector}
            toolbarRight={editorToggleButton}
            dropInsertEnabled={enableLibraryDrop}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-1.5 bg-secondary-50 border-b border-secondary-100 flex-shrink-0">
          {sourceSelector}
          {editorToggleButton}
        </div>
      )}
    </div>
  );

  const renderChartSection = () => (
    <div className="h-full flex flex-col" data-testid="chart-section">
      <ExplorerInputsToolbar projectId={projectId} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ExplorerErrorBoundary fallback="Chart preview error">
          <ExplorerChartPreview />
        </ExplorerErrorBoundary>
      </div>
    </div>
  );

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      data-testid="center-panel"
      ref={containerRef}
    >
      {/* Model Tab Bar (standalone /explorer) or query chips (exploration surface) */}
      {modelTabBar}

      {/* Top row: Editor + Chart */}
      <div
        style={topRowStyle}
        className="overflow-hidden min-h-0"
        ref={topRowRef}
        data-testid="center-panel-top-row"
        data-auto-height={useAutoTopHeight ? 'true' : 'false'}
      >
        {isWide ? (
          /* Wide mode: side-by-side */
          <div className="flex h-full">
            <div style={{ width: `${editorChartRatio * 100}%` }} className="overflow-hidden">
              {renderEditorSection()}
            </div>
            <VerticalDivider isDragging={isHorizResizing} handleMouseDown={handleHorizMouseDown} />
            <div style={{ width: `${(1 - editorChartRatio) * 100}%` }} className="overflow-hidden">
              {renderChartSection()}
            </div>
          </div>
        ) : (
          /* Narrow mode: toggle between editor and chart */
          <div className="flex flex-col h-full">
            <div className="flex border-b border-secondary-200 flex-shrink-0">
              <button
                type="button"
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  centerMode !== 'chart'
                    ? 'text-primary border-b-2 border-primary bg-white'
                    : 'text-secondary-500 hover:text-secondary-700'
                }`}
                onClick={() => setCenterMode('editor')}
                data-testid="toggle-sql"
              >
                <PiCode size={14} />
                SQL
              </button>
              <button
                type="button"
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  centerMode === 'chart'
                    ? 'text-primary border-b-2 border-primary bg-white'
                    : 'text-secondary-500 hover:text-secondary-700'
                }`}
                onClick={() => setCenterMode('chart')}
                data-testid="toggle-chart"
              >
                <PiChartBar size={14} />
                Chart
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {centerMode === 'chart' ? renderChartSection() : renderEditorSection()}
            </div>
          </div>
        )}
      </div>

      {/* Horizontal divider */}
      <Divider isDragging={isVertResizing} handleMouseDown={handleVertMouseDownAndMarkAdjusted} />

      {/* Bottom row: Data Table */}
      <div style={bottomRowStyle} className="overflow-hidden min-h-0" data-testid="data-section">
        <div className="flex h-full">
          {queryResult ? (
            <>
              <div className="flex-1 flex flex-col min-w-0">
                <DataSectionToolbar />
                {/* P6-D12 (e2e-gap-review.md "Phase 6 delta pass") — a
                    dedicated testid scoped to JUST the results grid (not
                    `data-section`, which also contains `DataSectionToolbar`'s
                    computed-column pills). Without this, an e2e assertion
                    like "column X appears in the results grid" can be
                    satisfied by the toolbar's own pill text instead of the
                    grid actually materializing the column. */}
                <div className="flex-1 min-h-0" data-testid="explorer-results-grid">
                  <DataTable
                    columns={dataTableColumns}
                    rows={paginatedRows}
                    totalRowCount={totalRowCount}
                    page={resultsPage}
                    pageSize={resultsPageSize}
                    pageCount={pageCount}
                    onPageChange={setResultsPage}
                    onPageSizeChange={setResultsPageSize}
                    onColumnProfileRequest={setProfileColumn}
                    isLoading={false}
                    height="100%"
                    HeaderComponent={DraggableColumnHeader}
                  />
                </div>
              </div>
              <ColumnProfilePanel
                column={profileColumn}
                profile={selectedColumnProfile}
                db={duckDb}
                tableName={duckDbTable}
                rowCount={totalRowCount}
                onClose={() => setProfileColumn(null)}
                isOpen={!!profileColumn && !!selectedColumnProfile}
              />
            </>
          ) : queryError ? (
            <div className="flex items-center justify-center h-full w-full p-8">
              <div
                className="text-sm text-highlight font-mono whitespace-pre-wrap"
                data-testid="query-error"
              >
                {queryError}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full w-full">
              <span className="text-sm text-secondary-400" data-testid="empty-results">
                Run a query to see results
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CenterPanel;
