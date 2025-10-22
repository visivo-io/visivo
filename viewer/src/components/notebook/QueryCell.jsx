import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Menu, MenuItem, IconButton, CircularProgress } from '@mui/material';
import useStore from '../../stores/store';
import CellResultView from './CellResultView';
import SourceDropdown from '../explorer/SourceDropdown';
import ModelDropdown from '../explorer/ModelDropdown';
import { QUERY_LIMITS } from '../../constants/queryLimits';

const QueryCell = ({
  worksheetId,
  cell,
  result,
  error,
  isExecuting,
  onExecute,
  onDelete,
  onAddBelow,
  onQueryChange,
  onSourceChange,
  onModelChange,
  onBatchCellUpdate,
  onFocusNext,
  isFirst,
  isLast,
}) => {
  const editorRef = useRef(null);
  const [localQuery, setLocalQuery] = useState(cell.query_text || '');
  const [anchorEl, setAnchorEl] = useState(null);
  const [isModelModified, setIsModelModified] = useState(false);
  const [showLongRunningWarning, setShowLongRunningWarning] = useState(false);
  const executionTimerRef = useRef(null);

  const { project, namedChildren, cancelCellExecution } = useStore();

  // Get the selected source config from namedChildren based on cell's selected_source name
  const selectedSource =
    cell.selected_source && namedChildren[cell.selected_source]
      ? namedChildren[cell.selected_source].config
      : null;

  // Sync local query with cell query when cell changes
  useEffect(() => {
    setLocalQuery(cell.query_text || '');
  }, [cell.query_text]);

  // Check if model exists in namedChildren
  useEffect(() => {
    if (cell.associated_model && namedChildren) {
      const modelExists = namedChildren[cell.associated_model];
      if (!modelExists) {
        // Associated model not found in namedChildren
      }
    }
  }, [cell.associated_model, namedChildren]);

  // Monitor execution time and show warning after 30 seconds
  useEffect(() => {
    if (isExecuting) {
      // Clear any existing timer
      if (executionTimerRef.current) {
        clearTimeout(executionTimerRef.current);
      }

      // Set a timer for 30 seconds
      executionTimerRef.current = setTimeout(() => {
        setShowLongRunningWarning(true);
      }, QUERY_LIMITS.WARNING_TIMEOUT_MS);

      return () => {
        if (executionTimerRef.current) {
          clearTimeout(executionTimerRef.current);
        }
      };
    } else {
      // Clear warning when execution stops
      setShowLongRunningWarning(false);
      if (executionTimerRef.current) {
        clearTimeout(executionTimerRef.current);
      }
    }
  }, [isExecuting]);

  const handleCancelExecution = () => {
    cancelCellExecution(cell.id);
    setShowLongRunningWarning(false);
  };

  const handleEditorChange = value => {
    if (value !== undefined) {
      setLocalQuery(value);
      // Debounced update to store handled by parent
      onQueryChange(value);

      // If this cell is associated with a model, mark it as modified
      if (cell.associated_model && namedChildren[cell.associated_model]) {
        const model = namedChildren[cell.associated_model];
        // Check if the query has changed from the model's SQL
        if (model.config.sql !== value) {
          setIsModelModified(true);
          // Update the model's SQL in namedChildren
          useStore.setState({
            namedChildren: {
              ...namedChildren,
              [cell.associated_model]: {
                ...model,
                config: {
                  ...model.config,
                  sql: value,
                },
                status: model.status === 'New' ? 'New' : 'Modified',
              },
            },
          });
        } else {
          setIsModelModified(false);
        }
      }
    }
  };

  const handleMenuOpen = event => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDelete = () => {
    handleMenuClose();
    onDelete();
  };

  const handleAddBelow = () => {
    handleMenuClose();
    onAddBelow();
  };

  const handleSourceChange = newSource => {
    // Update the cell's source
    if (onSourceChange) {
      onSourceChange(newSource?.name);
    }
  };

  const handleModelChange = modelName => {
    // Update the cell's associated model
    if (onModelChange) {
      if (modelName) {
        // Check if model exists, or create it if new
        const existingModel = namedChildren[modelName];
        if (existingModel) {
          // Load model's SQL and source into cell
          const modelSql = existingModel.config.sql || '';
          const modelSource = existingModel.config.source;

          // Update local state
          setLocalQuery(modelSql);
          setIsModelModified(false);

          // Prepare batched update with all related fields
          const batchedUpdates = {
            query_text: modelSql,
            associated_model: modelName,
          };

          // Add source to batched update if model has one
          if (modelSource && modelSource.name) {
            const sourceData = Object.values(namedChildren || {}).find(
              item => item.type_key === 'sources' && item.config.name === modelSource.name
            );
            if (sourceData) {
              batchedUpdates.selected_source = sourceData.config.name;
            }
          }

          // Send all updates in a single atomic call
          if (onBatchCellUpdate) {
            onBatchCellUpdate(batchedUpdates);
          } else {
            // Fallback to individual updates if batch handler not available
            onQueryChange(modelSql);
            if (batchedUpdates.selected_source && onSourceChange) {
              onSourceChange(batchedUpdates.selected_source);
            }
            onModelChange(modelName);
          }
        } else {
          // Create new model in namedChildren
          const newModel = {
            type: 'SqlModel',
            type_key: 'models',
            config: {
              name: modelName,
              sql: localQuery || '',
              source: selectedSource ? { name: selectedSource.name } : null,
            },
            status: 'New',
            file_path: useStore.getState().projectFilePath,
            new_file_path: useStore.getState().projectFilePath,
            path: null,
          };

          useStore.setState({
            namedChildren: {
              ...namedChildren,
              [modelName]: newModel,
            },
          });

          setIsModelModified(false);

          // Update cell with new model association only
          onModelChange(modelName);
        }
      } else {
        // Clear model association
        onModelChange(null);
        setIsModelModified(false);
      }
    }
  };

  return (
    <div
      id={`cell-${cell.id}`}
      className="mb-4 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Cell Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <DragIndicatorIcon className="text-gray-400 cursor-move" fontSize="small" />
          {/* Model Dropdown */}
          <div className="ml-2">
            <ModelDropdown
              associatedModel={cell.associated_model}
              onModelChange={handleModelChange}
              isLoading={isExecuting}
              isModified={isModelModified}
            />
          </div>
          {isExecuting && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <CircularProgress size={12} thickness={6} />
                Running...
              </span>
              {showLongRunningWarning && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-orange-600 font-medium">
                    Taking longer than expected
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelExecution}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {error && <span className="text-xs text-red-600">Error</span>}
        </div>
        <div className="flex items-center gap-1">
          {/* Source Dropdown */}
          <div className="mr-2">
            <SourceDropdown
              selectedSource={selectedSource}
              onSourceChange={handleSourceChange}
              isLoading={isExecuting}
            />
          </div>
          <button
            type="button"
            className={`text-white ${
              isExecuting ? 'bg-[#A06C86]' : 'bg-[#713B57] hover:bg-[#5A2E46]'
            } focus:ring-2 focus:ring-[#A06C86] font-medium rounded text-xs px-3 py-1.5 flex items-center gap-1`}
            onClick={onExecute}
            disabled={isExecuting}
            title="Run cell (Cmd/Ctrl+Enter)"
          >
            {isExecuting ? (
              <>
                <CircularProgress size={12} thickness={6} className="text-white" />
                Running
              </>
            ) : (
              <>
                <PlayArrowIcon sx={{ fontSize: 14 }} />
                Run
              </>
            )}
          </button>
          <IconButton size="small" onClick={handleMenuOpen} data-testid="cell-menu-button">
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem onClick={handleAddBelow}>
              <AddIcon fontSize="small" className="mr-2" />
              Add Cell Below
            </MenuItem>
            <MenuItem onClick={handleDelete} disabled={isFirst && isLast}>
              <DeleteIcon fontSize="small" className="mr-2" />
              Delete Cell
            </MenuItem>
          </Menu>
        </div>
      </div>

      {/* Editor */}
      <div className="relative">
        <div
          className="min-h-[120px] bg-[#1E1E1E] overflow-hidden"
          style={{ height: Math.max(120, (localQuery.split('\n').length + 1) * 19) }}
        >
          <Editor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={localQuery}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              readOnly: isExecuting,
              automaticLayout: true,
              quickSuggestions: true,
              wordWrap: 'on',
              padding: { top: 12, bottom: 12, left: 8, right: 8 },
              fixedOverflowWidgets: true,
              lineNumbers: 'on',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 12,
              lineNumbersMinChars: 3,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'auto',
                handleMouseWheel: false,
              },
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor;

              // Cmd/Ctrl+Enter: Execute current cell
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                onExecute();
              });

              // Shift+Enter: Execute current cell and advance to next (or create new)
              editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
                onExecute();
                // Focus next cell after a short delay to allow execution to start
                setTimeout(() => {
                  if (isLast) {
                    // If this is the last cell, add a new one below
                    onAddBelow();
                  } else if (onFocusNext) {
                    // Otherwise, focus the next cell
                    onFocusNext();
                  }
                }, 100);
              });

              // Alt+Enter: Insert a new cell below without executing
              editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
                onAddBelow();
              });

              // Auto-resize editor
              const updateHeight = () => {
                const contentHeight = Math.max(120, editor.getContentHeight());
                editor.getContainerDomNode().style.height = `${contentHeight}px`;
                editor.layout();
              };

              editor.onDidContentSizeChange(updateHeight);
              updateHeight();
            }}
          />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-100">
          <div className="text-sm text-red-800 font-medium mb-2">Error</div>
          <div className="text-sm text-red-700 font-mono whitespace-pre-wrap break-words">
            {error}
          </div>
        </div>
      )}

      {/* Results Display */}
      {result && !error && (
        <div className="border-t border-gray-100">
          <CellResultView result={result} cell={cell} worksheetId={worksheetId} project={project} />
        </div>
      )}
    </div>
  );
};

export default QueryCell;
