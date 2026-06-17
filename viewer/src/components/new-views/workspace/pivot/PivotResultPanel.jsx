import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useStore from '../../../../stores/store';
import DataTable from '../../../common/DataTable';
import { usePivotData } from '../../../../hooks/usePivotData';
import { COLUMN_TYPES } from '../../../../duckdb/schemaUtils';

/**
 * PivotResultPanel — VIS-1008.
 *
 * The live RESULT pane of the pivot playground. It runs the EXISTING pivot
 * pipeline (`usePivotData`) on the playground's serialised draft refs and renders
 * the result through the shared `<DataTable>` — the same hook + renderer the
 * saved `<PivotableTable>` uses, so the preview is faithful to what ships.
 *
 * The draft is serialised by PivotPlayground into a DuckDB pivot config
 * (`{ columns, rows, values }` of `${ref(name).field}` strings); `sourceData`
 * (the parent insight/model's loaded data with `props_mapping` + `files`) is
 * resolved from the store by `sourceName`, mirroring how <Table> resolves its
 * own sourceData.
 *
 * @param {Object} config      DuckDB pivot config `{ columns, rows, values }` (or
 *   null when the draft is incomplete — nothing to run yet).
 * @param {string} sourceName  the parent object name whose loaded data backs the
 *   pivot.
 */
const PivotResultPanel = ({ config, sourceName }) => {
  const sourceData = useStore(
    useShallow(state => {
      if (!sourceName) return null;
      return state.insightJobs?.[sourceName] || state.modelJobs?.[sourceName] || null;
    })
  );

  const hasConfig = !!(config && config.columns && config.columns.length);

  const {
    rows: pivotRows,
    columns: pivotColumns,
    nestedColumns,
    pivotMeta,
    isLoading,
    error,
  } = usePivotData(hasConfig ? config : null, hasConfig ? sourceData : null);

  const dataTableColumns = useMemo(
    () =>
      (pivotColumns || []).map(col => ({
        name: col.accessorKey || col.id,
        displayName: col.header,
        normalizedType: COLUMN_TYPES.UNKNOWN,
        duckdbType: 'VARCHAR',
        isPivotRow: col.isPivotRow || false,
      })),
    [pivotColumns]
  );

  const stickyLeftColumns = useMemo(
    () => dataTableColumns.filter(c => c.isPivotRow).map(c => c.name),
    [dataTableColumns]
  );

  const headerBanner = pivotMeta ? (
    <div
      data-testid="pivot-result-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-600"
    >
      <span>
        <span className="font-semibold text-gray-700">Aggregations:</span>{' '}
        {pivotMeta.aggregationLabel}
      </span>
      <span>
        <span className="font-semibold text-gray-700">Columns:</span> {pivotMeta.pivotFieldName}
      </span>
      <span>
        <span className="font-semibold text-gray-700">Rows:</span>{' '}
        {(pivotMeta.rowFieldNames || []).join(', ')}
      </span>
    </div>
  ) : null;

  let body;
  if (!hasConfig) {
    body = (
      <div
        data-testid="pivot-result-empty"
        className="flex flex-1 items-center justify-center p-8 text-center"
      >
        <span className="text-[13px] text-gray-400">
          Drag a field onto the Columns shelf to build a pivot.
        </span>
      </div>
    );
  } else if (error) {
    body = (
      <div
        data-testid="pivot-result-error"
        className="flex flex-1 items-center justify-center p-8 text-center"
      >
        <span className="max-w-[420px] text-[13px] text-highlight-700">{error}</span>
      </div>
    );
  } else {
    body = (
      <div className="flex-1 min-h-0 min-w-0">
        <DataTable
          columns={dataTableColumns}
          rows={pivotRows || []}
          totalRowCount={(pivotRows || []).length}
          pageSize={1000}
          pageCount={1}
          nestedColumns={nestedColumns || undefined}
          stickyLeftColumns={stickyLeftColumns}
          headerBanner={headerBanner}
          isLoading={isLoading}
          isQuerying={isLoading}
          height="100%"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="pivot-result"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-white"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Result
        </span>
        {isLoading && hasConfig && (
          <span data-testid="pivot-result-loading" className="text-[11px] text-gray-400">
            running…
          </span>
        )}
      </div>
      {body}
    </div>
  );
};

export default PivotResultPanel;
