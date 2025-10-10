import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SaveIcon from '@mui/icons-material/Save';
import { Menu, MenuItem, IconButton, CircularProgress } from '@mui/material';
import useStore from '../../stores/store';
import CellResultView from './CellResultView';
import CreateObjectModal from '../editors/CreateObjectModal';
import SourceDropdown from '../explorer/SourceDropdown';

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
  isFirst,
  isLast,
}) => {
  const editorRef = useRef(null);
  const [localQuery, setLocalQuery] = useState(cell.query_text || '');
  const [anchorEl, setAnchorEl] = useState(null);
  const [showSaveAsModelModal, setShowSaveAsModelModal] = useState(false);
  const { project, namedChildren } = useStore();

  // Get the selected source config from namedChildren based on cell's selected_source name
  const selectedSource =
    cell.selected_source && namedChildren[cell.selected_source]
      ? namedChildren[cell.selected_source].config
      : null;

  // Sync local query with cell query when cell changes
  useEffect(() => {
    setLocalQuery(cell.query_text || '');
  }, [cell.query_text]);

  const handleEditorChange = value => {
    if (value !== undefined) {
      setLocalQuery(value);
      // Debounced update to store handled by parent
      onQueryChange(value);
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

  const handleSaveAsModel = () => {
    handleMenuClose();
    setShowSaveAsModelModal(true);
  };

  const handleModelCreated = newModel => {
    // Model has been created and added to namedChildren
    // We could show a success message here if needed
    console.log('Model created:', newModel);
  };

  const handleSourceChange = newSource => {
    // Update the cell's source
    if (onSourceChange) {
      onSourceChange(newSource?.name);
    }
  };

  return (
    <div className="mb-4 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Cell Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <DragIndicatorIcon className="text-gray-400 cursor-move" fontSize="small" />
          <span className="text-xs text-gray-500 font-medium">Cell {cell.cell_order + 1}</span>
          {isExecuting && (
            <span className="text-xs text-blue-600 flex items-center gap-1">
              <CircularProgress size={12} thickness={6} />
              Running...
            </span>
          )}
          {error && <span className="text-xs text-red-600">Error</span>}
          {result && !error && !isExecuting && (
            <span className="text-xs text-green-600">Complete</span>
          )}
          {/* Source Dropdown */}
          <div className="ml-2">
            <SourceDropdown
              selectedSource={selectedSource}
              onSourceChange={handleSourceChange}
              isLoading={isExecuting}
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
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
          <IconButton size="small" onClick={handleMenuOpen}>
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
            <MenuItem onClick={handleSaveAsModel} disabled={!localQuery.trim()}>
              <SaveIcon fontSize="small" className="mr-2" />
              Save as Model
            </MenuItem>
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
              padding: { top: 12, bottom: 12 },
              fixedOverflowWidgets: true,
              lineNumbers: 'off',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 0,
              lineNumbersMinChars: 0,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'auto',
                handleMouseWheel: false,
              },
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor;

              // Add keyboard shortcuts
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                onExecute();
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
          <div className="text-sm text-red-800 font-medium">Error</div>
          <div className="text-sm text-red-700 mt-1">{error}</div>
        </div>
      )}

      {/* Results Display */}
      {result && !error && (
        <div className="border-t border-gray-100">
          <CellResultView result={result} cell={cell} worksheetId={worksheetId} project={project} />
        </div>
      )}

      {/* Save as Model Modal */}
      <CreateObjectModal
        isOpen={showSaveAsModelModal}
        onClose={() => setShowSaveAsModelModal(false)}
        objSelectedProperty="models"
        objStep="type"
        onSubmitCallback={handleModelCreated}
        showFileOption={true}
        initialAttributes={{ sql: localQuery }}
      />
    </div>
  );
};

export default QueryCell;
