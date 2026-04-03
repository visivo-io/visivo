import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PiPlus, PiCaretUp } from 'react-icons/pi';
import { PropertyRow } from './PropertyRow';
import { PropertySearch } from './PropertySearch';
import {
  flattenSchemaProperties,
  getValueAtPath,
  setValueAtPath,
} from './utils/schemaUtils';

/**
 * SchemaEditor - Main container for schema-driven form editing
 *
 * @param {object} props
 * @param {object} props.schema - The JSON schema object
 * @param {object} props.value - Current values object
 * @param {function} props.onChange - Change handler (newValue) => void
 * @param {Array<string>} props.excludeProperties - Properties to hide (e.g., ['type'])
 * @param {Array<string>} props.initiallyExpanded - Properties to show by default
 * @param {boolean} props.disabled - Whether the editor is disabled
 * @param {boolean} props.droppable - Whether property rows support DnD drops
 */
export function SchemaEditor({
  schema,
  value = {},
  onChange,
  excludeProperties = ['type'],
  initiallyExpanded = [],
  disabled = false,
  droppable = false,
}) {
  const [addedProperties, setAddedProperties] = useState(() => new Set(initiallyExpanded));
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);

  const defs = useMemo(() => schema?.$defs || {}, [schema]);

  const allProperties = useMemo(() => {
    if (!schema) return [];
    const flattened = flattenSchemaProperties(schema, '', defs);
    return flattened.filter(prop => !excludeProperties.includes(prop.path.split('.')[0]));
  }, [schema, defs, excludeProperties]);

  const displayedProperties = useMemo(() => {
    return allProperties.filter(prop => addedProperties.has(prop.path));
  }, [allProperties, addedProperties]);

  const lastValueKeysRef = useRef('');

  useEffect(() => {
    if (!schema) return;

    const extractPaths = (obj, prefix = '') => {
      const paths = [];
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return paths;
      Object.keys(obj).forEach(key => {
        const path = prefix ? `${prefix}.${key}` : key;
        paths.push(path);
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          paths.push(...extractPaths(obj[key], path));
        }
      });
      return paths;
    };

    const pathsWithValues = extractPaths(value);
    const valueKeysKey = pathsWithValues.sort().join(',');

    // Only update if value paths actually changed (avoid infinite loop)
    if (valueKeysKey === lastValueKeysRef.current) return;
    lastValueKeysRef.current = valueKeysKey;

    const validPaths = pathsWithValues.filter(path => allProperties.some(p => p.path === path));
    setAddedProperties(prev => {
      const next = new Set([...initiallyExpanded, ...validPaths]);
      for (const p of prev) {
        if (allProperties.some(ap => ap.path === p)) next.add(p);
      }
      return next;
    });
  }, [schema, value, allProperties, initiallyExpanded]);

  const handlePropertyChange = useCallback(
    (path, newValue) => {
      const updatedValue = setValueAtPath(value, path, newValue);
      onChange(updatedValue);
    },
    [value, onChange]
  );

  const handlePropertyRemove = useCallback(
    path => {
      const updatedValue = setValueAtPath(value, path, undefined);
      onChange(updatedValue);
      setAddedProperties(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    },
    [value, onChange]
  );

  const handlePropertyToggle = useCallback(path => {
    setAddedProperties(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const sortedDisplayedProperties = useMemo(() => {
    return [...displayedProperties].sort((a, b) => {
      const aDepth = a.path.split('.').length;
      const bDepth = b.path.split('.').length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.path.localeCompare(b.path);
    });
  }, [displayedProperties]);

  if (!schema) {
    return (
      <div className="p-3 text-center">
        <span className="text-sm text-gray-500">No schema available</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Property picker toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowPropertyPicker(!showPropertyPicker)}
          disabled={disabled}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {showPropertyPicker ? <PiCaretUp size={12} /> : <PiPlus size={12} />}
          {showPropertyPicker ? 'Hide Properties' : 'Add Properties'}
        </button>

        <span className="ml-auto text-xs text-gray-500">
          {displayedProperties.length} of {allProperties.length} properties
        </span>
      </div>

      {/* Property search/picker */}
      {showPropertyPicker && (
        <PropertySearch
          properties={allProperties}
          selectedPaths={addedProperties}
          onToggle={handlePropertyToggle}
          disabled={disabled}
        />
      )}

      {/* Displayed properties */}
      {sortedDisplayedProperties.length === 0 ? (
        <div className="p-4 text-center bg-gray-50 rounded-md border border-dashed border-gray-300">
          <p className="text-sm text-gray-500 mb-1">No properties added yet</p>
          <p className="text-xs text-gray-400">
            Click &quot;Add Properties&quot; to select which fields to configure
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sortedDisplayedProperties.map(prop => (
            <PropertyRow
              key={prop.path}
              path={prop.path}
              value={getValueAtPath(value, prop.path)}
              onChange={newValue => handlePropertyChange(prop.path, newValue)}
              onRemove={() => handlePropertyRemove(prop.path)}
              schema={prop.schema}
              defs={defs}
              description={prop.description}
              disabled={disabled}
              droppable={droppable}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SchemaEditor;
