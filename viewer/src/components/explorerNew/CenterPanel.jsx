import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { PiCaretUp, PiCaretDown, PiCube, PiCode, PiChartBar } from 'react-icons/pi';
import SQLEditor from './SQLEditor';
import DataTable from '../common/DataTable';
import ColumnProfilePanel from './ColumnProfilePanel';
import ExplorerChartPreview from './ExplorerChartPreview';
import VerticalDivider from '../explorer/VerticalDivider';
import Divider from '../explorer/Divider';
import useStore from '../../stores/store';
import { inferColumnTypes } from '../../utils/inferColumnTypes';
import { computeColumnProfile } from '../../utils/computeColumnProfile';
import { usePanelResize } from '../../hooks/usePanelResize';

const NARROW_THRESHOLD = 600;

const CenterPanel = () => {
  const sourceName = useStore((s) => s.explorerSourceName);
  const sql = useStore((s) => s.explorerSql);
  const setSql = useStore((s) => s.setExplorerSql);
  const queryResult = useStore((s) => s.explorerQueryResult);
  const queryError = useStore((s) => s.explorerQueryError);
  const setQueryResult = useStore((s) => s.setExplorerQueryResult);
  const setQueryError = useStore((s) => s.setExplorerQueryError);
  const isEditorCollapsed = useStore((s) => s.explorerIsEditorCollapsed);
  const toggleEditorCollapsed = useStore((s) => s.toggleExplorerEditorCollapsed);
  const profileColumn = useStore((s) => s.explorerProfileColumn);
  const setProfileColumn = useStore((s) => s.setExplorerProfileColumn);
  const activeModelName = useStore((s) => s.explorerActiveModelName);
  const modelEditMode = useStore((s) => s.explorerModelEditMode);
  const handleModelEdit = useStore((s) => s.handleExplorerModelEdit);
  const models = useStore((s) => s.models);
  const centerMode = useStore((s) => s.explorerCenterMode);
  const setCenterMode = useStore((s) => s.setExplorerCenterMode);

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

  const handleSqlSave = useCallback(
    (value) => {
      setSql(value);
    },
    [setSql]
  );

  const dataTableColumns = useMemo(
    () => (queryResult ? inferColumnTypes(queryResult.columns || [], queryResult.rows || []) : []),
    [queryResult]
  );
  const tableRows = queryResult?.rows || [];
  const totalRowCount = queryResult?.row_count || tableRows.length;
  const pageCount = Math.ceil(tableRows.length / resultsPageSize);
  const paginatedRows = tableRows.slice(
    resultsPage * resultsPageSize,
    (resultsPage + 1) * resultsPageSize
  );

  const selectedColumnProfile = useMemo(() => {
    if (!profileColumn || !queryResult?.rows?.length) return null;
    const colDef = dataTableColumns.find((c) => c.name === profileColumn);
    if (!colDef) return null;
    return computeColumnProfile(profileColumn, colDef, queryResult.rows);
  }, [profileColumn, queryResult, dataTableColumns]);

  const topFlex = topBottomRatio;
  const bottomFlex = 1 - topBottomRatio;

  const renderEditorSection = () => (
    <div className="flex flex-col h-full overflow-hidden" data-testid="editor-section">
      {/* SQL Editor header (collapsible) */}
      <div className="flex items-center justify-between px-3 py-1 bg-secondary-50 border-b border-secondary-100 flex-shrink-0">
        <span className="text-xs font-medium text-secondary-600">SQL Editor</span>
        <button
          type="button"
          onClick={toggleEditorCollapsed}
          className="p-1 text-secondary-400 hover:text-secondary-600 transition-colors"
          title={isEditorCollapsed ? 'Expand editor' : 'Collapse editor'}
          data-testid="toggle-editor"
        >
          {isEditorCollapsed ? <PiCaretDown size={14} /> : <PiCaretUp size={14} />}
        </button>
      </div>
      {!isEditorCollapsed && (
        <div className="flex-1 min-h-0">
          <SQLEditor
            sourceName={sourceName}
            initialValue={sql}
            onSave={handleSqlSave}
            height="100%"
            hideResults
            onQueryComplete={handleQueryComplete}
          />
        </div>
      )}
    </div>
  );

  const renderChartSection = () => (
    <div className="h-full overflow-hidden" data-testid="chart-section">
      <ExplorerChartPreview />
    </div>
  );

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      data-testid="center-panel"
      ref={containerRef}
    >
      {/* Model context banner for "use" mode */}
      {activeModelName && modelEditMode === 'use' && (
        <div
          className="flex items-center gap-2 px-3 py-2 bg-primary-50 border-b border-primary-100 text-xs flex-shrink-0"
          data-testid="model-use-banner"
        >
          <PiCube size={14} className="text-primary flex-shrink-0" />
          <span className="text-secondary-700">
            Using SQL from model <strong>&quot;{activeModelName}&quot;</strong> (ad-hoc copy).
            Changes here won&apos;t affect the saved model.
          </span>
          <button
            type="button"
            className="ml-auto text-primary hover:text-primary-700 font-medium"
            onClick={() => {
              const model = models.find((m) => m.name === activeModelName);
              if (model) handleModelEdit(model);
            }}
            data-testid="banner-edit-button"
          >
            Edit Model
          </button>
        </div>
      )}

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
                <div className="flex items-center gap-3 px-3 py-2 bg-secondary-50 border-b border-secondary-100 flex-shrink-0">
                  <span className="text-xs text-secondary-600">
                    {totalRowCount.toLocaleString()} row{totalRowCount !== 1 ? 's' : ''}
                  </span>
                  {queryResult.truncated && (
                    <span className="text-xs text-secondary-400">(truncated)</span>
                  )}
                  {queryResult.execution_time_ms && (
                    <span className="text-xs text-secondary-400">
                      {queryResult.execution_time_ms}ms
                    </span>
                  )}
                </div>
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
                    onColumnProfileRequest={(colName) => setProfileColumn(colName)}
                    isLoading={false}
                    height="100%"
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
