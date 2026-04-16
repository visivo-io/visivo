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
import ModelTabBar from './ModelTabBar';
import VerticalDivider from '../explorer/VerticalDivider';
import Divider from '../explorer/Divider';
import useStore from '../../stores/store';
import {
  selectActiveModelSql,
  selectActiveModelSourceName,
  selectActiveModelQueryResult,
  selectActiveModelQueryError,
  selectActiveModelComputedColumns,
  selectActiveModelEnrichedResult,
} from '../../stores/explorerNewStore';
import { inferColumnTypes } from '../../utils/inferColumnTypes';
import { computeColumnProfile } from '../../utils/computeColumnProfile';
import { usePanelResize } from '../../hooks/usePanelResize';
import useExplorerDuckDB from '../../hooks/useExplorerDuckDB';

const NARROW_THRESHOLD = 600;

const CenterPanel = () => {
  const sourceName = useStore(selectActiveModelSourceName);
  const setSourceName = useStore((s) => s.setActiveModelSource);
  const explorerSources = useStore((s) => s.explorerSources);
  const sql = useStore(selectActiveModelSql);
  const setSql = useStore((s) => s.setActiveModelSql);
  const queryResult = useStore(selectActiveModelQueryResult);
  const queryError = useStore(selectActiveModelQueryError);
  const setQueryResult = useStore((s) => s.setActiveModelQueryResult);
  const setQueryError = useStore((s) => s.setActiveModelQueryError);
  const isEditorCollapsed = useStore((s) => s.explorerIsEditorCollapsed);
  const toggleEditorCollapsed = useStore((s) => s.toggleExplorerEditorCollapsed);
  const profileColumn = useStore((s) => s.explorerProfileColumn);
  const setProfileColumn = useStore((s) => s.setExplorerProfileColumn);
  const centerMode = useStore((s) => s.explorerCenterMode);
  const setCenterMode = useStore((s) => s.setExplorerCenterMode);
  const enrichedResult = useStore(selectActiveModelEnrichedResult);
  const computedColumns = useStore(selectActiveModelComputedColumns);
  const duckDBLoading = useStore((s) => s.explorerDuckDBLoading);
  const duckDBError = useStore((s) => s.explorerDuckDBError);
  const removeComputedColumn = useStore((s) => s.removeActiveModelComputedColumn);
  const addComputedColumn = useStore((s) => s.addActiveModelComputedColumn);
  const updateComputedColumn = useStore((s) => s.updateActiveModelComputedColumn);
  const validateExpression = useStore((s) => s.validateExplorerExpression);
  const failedComputedColumns = useStore((s) => s.explorerFailedComputedColumns);
  const projectId = useStore((s) => s.project?.id);

  // Initialize DuckDB integration for computed columns
  useExplorerDuckDB();

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

  // Vertical split: top <-> bottom
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

  // Fix Plotly resize when divider ratios change
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    return () => cancelAnimationFrame(frame);
  }, [editorChartRatio, topBottomRatio]);

  const [resultsPage, setResultsPage] = useState(0);
  const [resultsPageSize, setResultsPageSize] = useState(1000);
  useEffect(() => {
    setResultsPage(0);
  }, [queryResult]);

  const handleQueryComplete = useCallback(
    ({ result, error }) => {
      if (result) {
        setQueryResult(result);
      }
      if (error) {
        setQueryError(error);
      }
    },
    [setQueryResult, setQueryError]
  );


  // Use enriched result (with computed columns) when available, otherwise base result
  const displayResult = enrichedResult || queryResult;
  const computedColumnNames = useMemo(
    () => new Set(enrichedResult?.computedColumnNames || []),
    [enrichedResult]
  );

  // All column names (base + computed) for duplicate checking
  const allColumnNames = useMemo(() => {
    const names = new Set(displayResult?.columns || []);
    computedColumns.forEach((c) => names.add(c.name));
    return names;
  }, [displayResult, computedColumns]);

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

  const handleValidateExpression = useCallback(
    (expression) => validateExpression(expression, sourceName),
    [validateExpression, sourceName]
  );

  const topFlex = topBottomRatio;
  const bottomFlex = 1 - topBottomRatio;

  const sourceSelector = (
    <div className="relative" data-testid="source-selector-wrapper">
      <select
        value={sourceName || ''}
        onChange={(e) => setSourceName(e.target.value || null)}
        className="appearance-none pl-2 pr-5 py-0.5 text-xs border border-secondary-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
        data-testid="source-selector"
      >
        <option value="">Select source</option>
        {explorerSources.map((s) => (
          <option key={s.source_name} value={s.source_name}>
            {s.source_name}
          </option>
        ))}
      </select>
      <PiCaretDown
        className="absolute right-1 top-1/2 -translate-y-1/2 text-secondary-400 pointer-events-none"
        size={10}
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
    <div className="flex flex-col h-full overflow-hidden" data-testid="editor-section">
      {!isEditorCollapsed ? (
        <div className="flex-1 min-h-0">
          <SQLEditor
            sourceName={sourceName}
            initialValue={sql}
            onSave={setSql}
            height="100%"
            hideResults
            onQueryComplete={handleQueryComplete}
            toolbarExtra={sourceSelector}
            toolbarRight={editorToggleButton}
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
      {/* Model Tab Bar */}
      <ModelTabBar />

      {/* Top row: Editor + Chart */}
      <div style={{ flex: topFlex }} className="overflow-hidden min-h-0" ref={topRowRef}>
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
      <Divider isDragging={isVertResizing} handleMouseDown={handleVertMouseDown} />

      {/* Bottom row: Data Table */}
      <div style={{ flex: bottomFlex }} className="overflow-hidden min-h-0" data-testid="data-section">
        <div className="flex h-full">
          {queryResult ? (
            <>
              <div className="flex-1 flex flex-col min-w-0">
                <DataSectionToolbar
                  totalRowCount={totalRowCount}
                  truncated={queryResult.truncated}
                  executionTimeMs={queryResult.execution_time_ms}
                  duckDBLoading={duckDBLoading}
                  duckDBError={duckDBError}
                  failedComputedColumns={failedComputedColumns}
                  computedColumns={computedColumns}
                  onAddComputedColumn={addComputedColumn}
                  onUpdateComputedColumn={updateComputedColumn}
                  onRemoveComputedColumn={removeComputedColumn}
                  onValidateExpression={handleValidateExpression}
                  allColumnNames={allColumnNames}
                />
                <div className="flex-1 min-h-0">
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
