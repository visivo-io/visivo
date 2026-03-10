import React, { useMemo, useState, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PiTrash, PiCode, PiSliders } from 'react-icons/pi';
import RefTextArea from '../RefTextArea';
import { isQueryStringValue, QUERY_BRACKET_PATTERN } from '../../../../utils/queryString';
import { supportsQueryString, getStaticSchema } from './utils/schemaUtils';
import { resolveFieldType } from './utils/fieldResolver';
import { getFieldComponent } from './fields/fields';

/**
 * PropertyRow - A single property in the schema editor with optional query-string toggle
 *
 * @param {object} props
 * @param {string} props.path - Dot-separated property path (e.g., "marker.color")
 * @param {any} props.value - Current value
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {function} props.onRemove - Handler to remove this property
 * @param {object} props.schema - The JSON schema for this property
 * @param {object} props.defs - Schema $defs for reference resolution
 * @param {string} props.description - Property description
 * @param {boolean} props.disabled - Whether the field is disabled
 * @param {boolean} props.droppable - Whether this row is a DnD drop target
 */
export function PropertyRow({
  path,
  value,
  onChange,
  onRemove,
  schema,
  defs = {},
  description,
  disabled = false,
  droppable = false,
}) {
  const queryStringSupported = useMemo(() => supportsQueryString(schema), [schema]);

  // DnD drop target (only when droppable + query-string supported)
  const dropEnabled = droppable && queryStringSupported;
  const { isOver, setNodeRef } = useDroppable({
    id: `property-${path}`,
    data: { path, type: 'property-zone', schema },
    disabled: !dropEnabled,
  });

  const isQueryMode = useMemo(() => isQueryStringValue(value), [value]);
  const [forceQueryMode, setForceQueryMode] = useState(() => isQueryStringValue(value));

  const staticSchema = useMemo(() => getStaticSchema(schema, defs), [schema, defs]);
  const fieldType = useMemo(() => resolveFieldType(schema, defs), [schema, defs]);
  const FieldComponent = getFieldComponent(fieldType);

  const handleModeChange = (newMode) => {
    setForceQueryMode(newMode === 'query');
  };

  const handleChange = (newValue) => {
    onChange(newValue);
  };

  // Strip ?{...} wrapper for RefTextArea display, re-wrap on change
  const queryInnerValue = useMemo(() => {
    if (typeof value === 'string') {
      const match = value.match(QUERY_BRACKET_PATTERN);
      return match ? match[1] : value;
    }
    return value || '';
  }, [value]);

  const handleQueryChange = useCallback(
    (newVal) => {
      onChange(newVal ? `?{${newVal}}` : '');
    },
    [onChange]
  );

  const currentMode = forceQueryMode || isQueryMode ? 'query' : 'static';

  const isDropTarget = isOver && dropEnabled;

  return (
    <div
      ref={dropEnabled ? setNodeRef : undefined}
      className={`flex flex-col gap-1.5 p-2.5 rounded-md transition-all duration-150 ${
        isDropTarget
          ? 'bg-primary-50 ring-2 ring-primary-300'
          : 'bg-gray-50 hover:bg-gray-100'
      }`}
      data-testid={droppable ? `droppable-property-${path}` : undefined}
    >
      {/* Header row with path, toggle, and remove button */}
      <div className="flex items-center gap-1.5">
        {/* Property path */}
        <span className="flex-1 text-xs font-medium font-mono text-gray-700 truncate">
          {path}
        </span>

        {/* Query-string toggle (only if supported) */}
        {queryStringSupported && (
          <div className="flex rounded-md border border-gray-300 overflow-hidden" role="group">
            <button
              type="button"
              aria-label="static value"
              aria-pressed={currentMode === 'static'}
              disabled={disabled}
              onClick={() => handleModeChange('static')}
              className={`p-1 transition-colors ${
                currentMode === 'static'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Static value"
            >
              <PiSliders size={14} />
            </button>
            <button
              type="button"
              aria-label="query string"
              aria-pressed={currentMode === 'query'}
              disabled={disabled}
              onClick={() => handleModeChange('query')}
              className={`p-1 border-l border-gray-300 transition-colors ${
                currentMode === 'query'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Query expression"
            >
              <PiCode size={14} />
            </button>
          </div>
        )}

        {/* Remove button */}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="remove property"
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remove property"
          >
            <PiTrash size={14} />
          </button>
        )}
      </div>

      {/* Field input */}
      <div>
        {currentMode === 'query' || (queryStringSupported && !staticSchema) ? (
          <RefTextArea
            value={queryInnerValue}
            onChange={handleQueryChange}
            label=""
            rows={2}
            helperText={description}
            disabled={disabled}
            allowedTypes={['model', 'dimension', 'metric']}
          />
        ) : (
          <FieldComponent
            value={value}
            onChange={handleChange}
            schema={fieldType === 'patternMultiselect' ? schema : staticSchema || schema}
            defs={defs}
            label=""
            description={description}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

export default PropertyRow;
