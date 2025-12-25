import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import useStore from '../../../stores/store';
import { getTypeByValue, DEFAULT_COLORS } from './objectTypeConfigs';
import {
  isInsideDollarBrace,
  formatRef,
  formatRefExpression,
} from '../../../utils/contextString';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

/**
 * RefTextArea - A Monaco-based SQL editor for expressions with ref() syntax
 *
 * Features:
 * - Always shows Monaco Editor with dark theme (consistent with SQL editor)
 * - + button inline with label to insert references
 * - Smart ${} wrapping - only adds when needed
 *
 * Props:
 * - value: Current text value
 * - onChange: Callback when value changes
 * - allowedTypes: Array of object types that can be referenced
 * - label: Label for the field
 * - error: Error message to display
 * - required: Whether the field is required
 * - disabled: Whether the field is disabled
 * - rows: Number of rows (approximate height)
 * - helperText: Helper text shown below the editor
 */
const RefTextArea = ({
  value = '',
  onChange,
  allowedTypes = ['model', 'dimension', 'metric', 'source'],
  label,
  error,
  required = false,
  disabled = false,
  rows = 4,
  helperText,
}) => {
  const [showSelector, setShowSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState(null);
  const [cursorPosition, setCursorPosition] = useState(null);
  const editorRef = useRef(null);
  const containerRef = useRef(null);

  // Get objects from store for each allowed type
  const sources = useStore(state => state.sources);
  const models = useStore(state => state.models);
  const dimensions = useStore(state => state.dimensions);
  const metrics = useStore(state => state.metrics);
  const relations = useStore(state => state.relations);

  // Build list of available objects based on allowed types
  const availableObjects = useMemo(() => {
    const objects = [];

    if (allowedTypes.includes('source')) {
      (sources || []).forEach(obj => {
        objects.push({ name: obj.name, type: 'source', config: obj.config });
      });
    }

    if (allowedTypes.includes('model')) {
      (models || []).forEach(obj => {
        objects.push({ name: obj.name, type: 'model', config: obj.config });
      });
    }

    if (allowedTypes.includes('dimension')) {
      (dimensions || []).forEach(obj => {
        objects.push({ name: obj.name, type: 'dimension', config: obj.config });
      });
    }

    if (allowedTypes.includes('metric')) {
      (metrics || []).forEach(obj => {
        objects.push({ name: obj.name, type: 'metric', config: obj.config });
      });
    }

    if (allowedTypes.includes('relation')) {
      (relations || []).forEach(obj => {
        objects.push({ name: obj.name, type: 'relation', config: obj.config });
      });
    }

    return objects;
  }, [allowedTypes, sources, models, dimensions, metrics, relations]);

  // Filter objects by search query and selected type
  const filteredObjects = useMemo(() => {
    let filtered = availableObjects;

    if (selectedType) {
      filtered = filtered.filter(obj => obj.type === selectedType);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(obj => obj.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [availableObjects, searchQuery, selectedType]);

  // Group objects by type for display
  const groupedObjects = useMemo(() => {
    const groups = {};
    filteredObjects.forEach(obj => {
      if (!groups[obj.type]) {
        groups[obj.type] = [];
      }
      groups[obj.type].push(obj);
    });
    return groups;
  }, [filteredObjects]);

  // Insert ref at cursor position
  const insertRef = useCallback(
    (objectName, property = null) => {
      // Use centralized formatting utilities for consistent output
      const refString = formatRef(objectName, property);
      const fullRefString = formatRefExpression(objectName, property);

      if (cursorPosition !== null) {
        // Insert at cursor position
        const insertPosition = cursorPosition;

        // Check if we're already inside a ${}
        if (isInsideDollarBrace(value, insertPosition)) {
          // Just insert ref() without ${}
          const newValue = value.slice(0, insertPosition) + refString + value.slice(insertPosition);
          onChange(newValue);
        } else {
          // Wrap with ${}
          const newValue = value.slice(0, insertPosition) + fullRefString + value.slice(insertPosition);
          onChange(newValue);
        }
      } else {
        // Append to end
        if (isInsideDollarBrace(value, value.length)) {
          onChange(value + refString);
        } else {
          onChange(value + fullRefString);
        }
      }

      // Close selector and clear state
      setShowSelector(false);
      setSearchQuery('');
      setCursorPosition(null);
    },
    [value, onChange, cursorPosition]
  );

  // Handle Monaco editor mount
  const handleEditorMount = editor => {
    editorRef.current = editor;

    // Track cursor position
    editor.onDidChangeCursorPosition(e => {
      const model = editor.getModel();
      if (model) {
        const offset = model.getOffsetAt(e.position);
        setCursorPosition(offset);
      }
    });
  };

  // Handle editor change
  const handleEditorChange = newValue => {
    onChange(newValue || '');
  };

  // Close selector
  const closeSelector = () => {
    setShowSelector(false);
    setSearchQuery('');
  };

  // Handle click outside to close selector
  useEffect(() => {
    const handleClickOutside = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate editor height based on rows
  const editorHeight = Math.max(80, rows * 20);

  // Check if we should show the add button (hide when cursor is inside ${})
  const showAddButton = !isInsideDollarBrace(value, cursorPosition ?? value.length);

  return (
    <div className="space-y-1" ref={containerRef}>
      {/* Label with inline + button */}
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {showAddButton && (
            <button
              type="button"
              onClick={() => setShowSelector(!showSelector)}
              disabled={disabled}
              className="p-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
              title="Insert reference"
            >
              <AddIcon fontSize="small" />
            </button>
          )}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="relative">
        <div
          className={`
            border rounded-md overflow-hidden
            ${error ? 'border-red-500' : 'border-gray-300'}
            focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500
          `}
        >
          <Editor
            height={editorHeight}
            language="sql"
            theme="vs-dark"
            value={value}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              automaticLayout: true,
              wordWrap: 'on',
              padding: { top: 12, bottom: 12, left: 8, right: 8 },
              lineNumbers: 'on',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 12,
              lineNumbersMinChars: 3,
              scrollbar: { vertical: 'auto', horizontal: 'auto' },
              readOnly: disabled,
            }}
          />
        </div>

        {/* Object Selector Popover */}
        {showSelector && (
          <div
            className="absolute z-50 right-0 mt-1
              w-80 max-h-96 overflow-hidden
              bg-white border border-gray-200 rounded-lg shadow-lg
              flex flex-col"
            style={{ top: '100%' }}
          >
            {/* Header */}
            <div className="p-3 border-b border-gray-200">
              {/* Search Input */}
              <div className="relative">
                <SearchIcon
                  fontSize="small"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search objects..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md
                    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  autoFocus
                />
              </div>

              {/* Type Filter Pills */}
              {allowedTypes.length > 1 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedType(null)}
                    className={`
                      px-2 py-1 text-xs rounded-full transition-colors
                      ${!selectedType ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                    `}
                  >
                    All
                  </button>
                  {allowedTypes.map(type => {
                    const typeConfig = getTypeByValue(type);
                    const colors = typeConfig?.colors || DEFAULT_COLORS;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedType(type === selectedType ? null : type)}
                        className={`
                          px-2 py-1 text-xs rounded-full transition-colors
                          ${selectedType === type ? `${colors.bg} ${colors.text}` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                        `}
                      >
                        {typeConfig?.label || type}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Object List */}
            <div className="flex-1 overflow-y-auto max-h-64">
              {Object.keys(groupedObjects).length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  {searchQuery ? 'No matching objects found' : 'No objects available'}
                </div>
              ) : (
                Object.entries(groupedObjects).map(([type, objects]) => {
                  const typeConfig = getTypeByValue(type);
                  const colors = typeConfig?.colors || DEFAULT_COLORS;
                  const TypeIcon = typeConfig?.icon;

                  return (
                    <div key={type}>
                      {/* Type Header */}
                      <div
                        className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wide sticky top-0 ${colors.bg} ${colors.text}`}
                      >
                        {typeConfig?.label || type}
                      </div>

                      {/* Objects */}
                      {objects.map(obj => (
                        <button
                          key={`${type}-${obj.name}`}
                          type="button"
                          onClick={() => insertRef(obj.name)}
                          className="w-full px-3 py-2 flex items-center gap-2
                            text-left hover:bg-gray-50 transition-colors
                            border-b border-gray-100 last:border-b-0"
                        >
                          {TypeIcon && <TypeIcon fontSize="small" className={colors.text} />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{obj.name}</div>
                            {obj.config?.description && (
                              <div className="text-xs text-gray-500 truncate">{obj.config.description}</div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={closeSelector}
                className="w-full px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900
                  hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Helper Text */}
      {helperText && !error && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}

      {/* Error Message */}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default RefTextArea;
