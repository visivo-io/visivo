import React, { useEffect, useCallback, useMemo } from 'react';
import useStore from '../../stores/store';
import QueryCell from './QueryCell';
import AddIcon from '@mui/icons-material/Add';
import { CircularProgress } from '@mui/material';

const NotebookWorksheet = ({ worksheetId }) => {
  const {
    worksheetCells,
    cellsLoading,
    cellsError,
    executingCells,
    loadCells,
    addCell,
    updateCellData,
    removeCellFromWorksheet,
    executeCellQuery,
    clearCellError,
  } = useStore();

  // Load cells when component mounts or worksheet changes
  useEffect(() => {
    if (worksheetId && !worksheetCells[worksheetId]) {
      loadCells(worksheetId);
    }
  }, [worksheetId, worksheetCells, loadCells]);

  const cells = useMemo(() => worksheetCells[worksheetId] || [], [worksheetCells, worksheetId]);
  const isLoading = cellsLoading[worksheetId];
  const error = cellsError[worksheetId];

  const handleExecuteCell = useCallback(
    cellId => {
      executeCellQuery(worksheetId, cellId);
    },
    [worksheetId, executeCellQuery]
  );

  const handleDeleteCell = useCallback(
    cellId => {
      removeCellFromWorksheet(worksheetId, cellId);
    },
    [worksheetId, removeCellFromWorksheet]
  );

  const handleAddCellBelow = useCallback(
    (afterCellId = null) => {
      // Find the position of the current cell
      const currentCellIndex = cells.findIndex(c => c.cell.id === afterCellId);
      const cellOrder = currentCellIndex !== -1 ? currentCellIndex + 1 : cells.length;

      addCell(worksheetId, '', cellOrder);
    },
    [worksheetId, cells, addCell]
  );

  const handleQueryChange = useCallback(
    (cellId, newQuery) => {
      // Debounced update to the store (auto-save handled by store)
      updateCellData(worksheetId, cellId, { query_text: newQuery });
    },
    [worksheetId, updateCellData]
  );

  const handleSourceChange = useCallback(
    (cellId, newSource) => {
      console.log('[NotebookWorksheet] Source change requested:', {
        cellId,
        newSource,
        worksheetId,
      });
      // Update cell's selected source
      updateCellData(worksheetId, cellId, { selected_source: newSource });
    },
    [worksheetId, updateCellData]
  );

  const handleModelChange = useCallback(
    (cellId, modelName) => {
      console.log('[NotebookWorksheet] Model change requested:', {
        cellId,
        modelName,
        worksheetId,
      });
      // Update cell's associated model
      updateCellData(worksheetId, cellId, { associated_model: modelName });
    },
    [worksheetId, updateCellData]
  );

  const handleBatchCellUpdate = useCallback(
    (cellId, updates) => {
      console.log('[NotebookWorksheet] Batch cell update requested:', {
        cellId,
        updates,
        worksheetId,
      });
      // Update cell with multiple fields atomically
      updateCellData(worksheetId, cellId, updates);
    },
    [worksheetId, updateCellData]
  );

  const handleFocusNextCell = useCallback(
    cellId => {
      const currentCells = cells;
      const currentIndex = currentCells.findIndex(c => c.cell.id === cellId);
      if (currentIndex !== -1 && currentIndex < currentCells.length - 1) {
        const nextCellId = currentCells[currentIndex + 1].cell.id;
        // Scroll to and focus the next cell
        setTimeout(() => {
          const nextCellElement = document.getElementById(`cell-${nextCellId}`);
          if (nextCellElement) {
            nextCellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Try to focus the Monaco editor inside
            const monacoTextarea = nextCellElement.querySelector('textarea');
            if (monacoTextarea) {
              monacoTextarea.focus();
            }
          }
        }, 150);
      }
    },
    [cells]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = e => {
      // Ctrl/Cmd + Shift + N: Add new cell at end
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleAddCellBelow(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleAddCellBelow]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <CircularProgress size={40} />
          <span className="text-sm text-gray-600">Loading cells...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-sm font-semibold text-red-800 mb-2">Error Loading Cells</h3>
        <p className="text-sm text-red-700 font-mono whitespace-pre-wrap break-words">{error}</p>
        <button
          type="button"
          className="mt-3 text-sm text-red-800 hover:text-red-900 underline"
          onClick={() => {
            clearCellError(worksheetId);
            loadCells(worksheetId);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No cells in this worksheet</p>
          <button
            type="button"
            className="bg-[#713B57] hover:bg-[#5A2E46] text-white font-medium rounded-lg text-sm px-4 py-2 flex items-center gap-2 mx-auto"
            onClick={() => handleAddCellBelow(null)}
          >
            <AddIcon fontSize="small" />
            Add First Cell
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto py-4 px-6">
      {/* Cells List */}
      <div className="space-y-4">
        {cells.map((cellData, index) => (
          <QueryCell
            key={cellData.cell.id}
            worksheetId={worksheetId}
            cell={cellData.cell}
            result={cellData.result}
            error={cellData.error}
            isExecuting={executingCells[cellData.cell.id] || false}
            onExecute={() => handleExecuteCell(cellData.cell.id)}
            onDelete={() => handleDeleteCell(cellData.cell.id)}
            onAddBelow={() => handleAddCellBelow(cellData.cell.id)}
            onQueryChange={newQuery => handleQueryChange(cellData.cell.id, newQuery)}
            onSourceChange={newSource => handleSourceChange(cellData.cell.id, newSource)}
            onModelChange={modelName => handleModelChange(cellData.cell.id, modelName)}
            onBatchCellUpdate={updates => handleBatchCellUpdate(cellData.cell.id, updates)}
            onFocusNext={() => handleFocusNextCell(cellData.cell.id)}
            isFirst={index === 0}
            isLast={index === cells.length - 1}
          />
        ))}
      </div>

      {/* Add Cell Button */}
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          className="text-gray-600 hover:text-gray-800 hover:bg-gray-100 font-medium rounded-lg text-sm px-4 py-2 flex items-center gap-2 border border-gray-300"
          onClick={() => handleAddCellBelow(null)}
        >
          <AddIcon fontSize="small" />
          Add Cell
        </button>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Keyboard Shortcuts</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
          <div>
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">Cmd/Ctrl+Enter</kbd>{' '}
            Run cell
          </div>
          <div>
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">Shift+Enter</kbd>{' '}
            Run cell and advance
          </div>
          <div>
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">Alt+Enter</kbd>{' '}
            Insert cell below
          </div>
          <div>
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded">
              Cmd/Ctrl+Shift+N
            </kbd>{' '}
            Add cell at end
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotebookWorksheet;
