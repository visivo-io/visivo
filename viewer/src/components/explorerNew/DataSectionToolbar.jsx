import React, { useState } from 'react';
import AddComputedColumnPopover from './AddComputedColumnPopover';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';

const DataSectionToolbar = ({
  totalRowCount,
  truncated,
  executionTimeMs,
  duckDBLoading,
  duckDBError,
  failedComputedColumns,
  computedColumns,
  onAddComputedColumn,
  onUpdateComputedColumn,
  onRemoveComputedColumn,
  onValidateExpression,
  allColumnNames,
}) => {
  const [editingColumn, setEditingColumn] = useState(null);
  const [editAnchorEl, setEditAnchorEl] = useState(null);

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 bg-secondary-50 border-b border-secondary-100 flex-shrink-0"
      data-testid="data-section-toolbar"
    >
      <span className="text-xs text-secondary-600">
        {totalRowCount.toLocaleString()} row{totalRowCount !== 1 ? 's' : ''}
      </span>
      {truncated && <span className="text-xs text-secondary-400">(truncated)</span>}
      {executionTimeMs && (
        <span className="text-xs text-secondary-400">{executionTimeMs}ms</span>
      )}
      {duckDBLoading && (
        <span className="text-xs text-primary-500" data-testid="duckdb-loading">
          Computing...
        </span>
      )}
      {duckDBError && !Object.keys(failedComputedColumns || {}).length && (
        <span className="text-xs text-highlight" data-testid="duckdb-error" title={duckDBError}>
          DuckDB error
        </span>
      )}
      <div className="flex items-center gap-1 ml-auto" data-testid="computed-columns-area">
        {computedColumns.map((col) => {
          const isFailed = !!failedComputedColumns?.[col.name];
          return (
            <span key={col.name} data-testid={`computed-pill-${col.name}`}>
              <EmbeddedPill
                objectType={col.type}
                label={col.name}
                onClick={(e) => {
                  setEditingColumn(col);
                  setEditAnchorEl(e?.currentTarget || e?.target);
                }}
                onRemove={() => onRemoveComputedColumn(col.name)}
                tooltip={
                  isFailed
                    ? failedComputedColumns[col.name]
                    : `Click to edit ${col.name}`
                }
                className={
                  isFailed ? 'bg-red-50 text-red-800 border-red-200' : ''
                }
              />
            </span>
          );
        })}
        <AddComputedColumnPopover
          onAdd={onAddComputedColumn}
          onUpdate={(updated) => {
            onUpdateComputedColumn(updated.name, {
              expression: updated.expression,
              type: updated.type,
            });
          }}
          onValidate={onValidateExpression}
          existingNames={allColumnNames}
          editColumn={editingColumn}
          onEditClose={() => {
            setEditingColumn(null);
            setEditAnchorEl(null);
          }}
          anchorElement={editAnchorEl}
        />
      </div>
    </div>
  );
};

export default DataSectionToolbar;
