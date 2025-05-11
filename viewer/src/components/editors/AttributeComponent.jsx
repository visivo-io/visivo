import useStore from '../../stores/store'; // Adjust path to Zustand store
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import debounce from 'lodash/debounce'; // You'll need to install lodash if not already present
import ObjectPill from './ObjectPill'; // You'll need to create this component if it doesn't exist
import { createPortal } from 'react-dom';
import QueryPill from './QueryPill'; // You'll need to create this component if it doesn't exist
import ContextMenu from './ContextMenu';
import Input from '../styled/Input';
import InputShell from '../styled/InputShell';

function AttributeComponent({ name, value, path }) {
  const updateNamedChildAttribute = useStore(state => state.updateNamedChildAttribute);
  const namedChildren = useStore(state => state.namedChildren);
  const [localValue, setLocalValue] = useState(value);
  const [isJsonObject, setIsJsonObject] = useState(false);
  const [parsedObject, setParsedObject] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredChildren, setFilteredChildren] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [clickTimeout, setClickTimeout] = useState(null);
  const [isQueryValue, setIsQueryValue] = useState(false);
  const [queryType, setQueryType] = useState(null); // 'function' or 'bracket'
  const [contextMenu, setContextMenu] = useState(null);
  const deleteNamedChildAttribute = useStore(state => state.deleteNamedChildAttribute);
  const pillRef = useRef(null);

  // Check if value is valid JSON object with required structure
  const checkAndParseJson = useCallback(val => {
    // Check for query patterns first
    const queryFunctionPattern = /^query\((.*)\)$/;
    const queryBracketPattern = /^\?\{(.*)\}$/;

    if (queryFunctionPattern.test(val) || queryBracketPattern.test(val)) {
      setIsQueryValue(true);
      setQueryType(queryFunctionPattern.test(val) ? 'function' : 'bracket');
      setIsJsonObject(false);
      setParsedObject(null);
      return false;
    }

    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && parsed.name) {
        setParsedObject(parsed);
        setIsJsonObject(true);
        return true;
      }
    } catch (e) {
      // Not valid JSON
    }
    setIsJsonObject(false);
    setParsedObject(null);
    return false;
  }, []);

  // Create a debounced update function
  const debouncedUpdate = useCallback(
    newValue => {
      updateNamedChildAttribute(path, newValue);
    },
    [path, updateNamedChildAttribute]
  );

  // Create the debounced version outside the callback
  const debouncedUpdateFn = useMemo(() => debounce(debouncedUpdate, 300), [debouncedUpdate]);

  // Update local value immediately but debounce the store update
  const handleChange = e => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Handle @ mentions
    if (newValue.includes('@')) {
      const searchTerm = newValue.split('@').pop()?.toLowerCase() || '';
      const filtered = Object.keys(namedChildren).filter(child =>
        child.toLowerCase().includes(searchTerm)
      );
      setFilteredChildren(filtered);
      setShowDropdown(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
    }

    checkAndParseJson(newValue);
    debouncedUpdateFn(newValue);
  };

  // Add this function to handle scrolling
  const scrollSelectedIntoView = useCallback(index => {
    if (!dropdownRef.current) return;

    const dropdown = dropdownRef.current;
    const selectedElement = dropdown.children[index];

    if (!selectedElement) return;

    const dropdownRect = dropdown.getBoundingClientRect();
    const selectedRect = selectedElement.getBoundingClientRect();

    if (selectedRect.bottom > dropdownRect.bottom) {
      // Scroll down if selected item is below viewport
      selectedElement.scrollIntoView({ block: 'nearest' });
    } else if (selectedRect.top < dropdownRect.top) {
      // Scroll up if selected item is above viewport
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  // Modify handleKeyDown to include scrolling
  const handleKeyDown = e => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = Math.min(selectedIndex + 1, filteredChildren.length - 1);
        setSelectedIndex(nextIndex);
        scrollSelectedIntoView(nextIndex);
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(prevIndex);
        scrollSelectedIntoView(prevIndex);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredChildren[selectedIndex]) {
          const selectedChild = filteredChildren[selectedIndex];
          const reference = JSON.stringify({
            name: selectedChild,
            is_inline_defined: false,
            original_value: `\${ref(${selectedChild})}`,
          });
          setLocalValue(reference);
          checkAndParseJson(reference);
          debouncedUpdateFn(reference);
          setShowDropdown(false);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        break;
      default:
        break;
    }
  };

  const handlePillClick = e => {
    e.preventDefault();

    if (clickTimeout) {
      // Double click detected
      clearTimeout(clickTimeout);
      setClickTimeout(null);
    } else {
      // Set timeout for single click
      const timeout = setTimeout(() => {
        // Single click action
        if (isJsonObject && parsedObject) {
          const atReference = `@${parsedObject.name}`;
          setLocalValue(atReference);
          setIsJsonObject(false);
          setParsedObject(null);
          debouncedUpdateFn(atReference);

          // Filter children based on the current pill's name
          const searchTerm = parsedObject.name.toLowerCase();
          const filtered = Object.keys(namedChildren).filter(child =>
            child.toLowerCase().includes(searchTerm)
          );
          setFilteredChildren(filtered);
          setShowDropdown(true);

          // Find and set the index of the current item in the filtered list
          const currentIndex = filtered.findIndex(child => child.toLowerCase() === searchTerm);
          setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);

          // Update dropdown position based on the pill's position
          if (pillRef.current) {
            const rect = pillRef.current.getBoundingClientRect();
            setDropdownPosition({
              top: rect.bottom,
              left: rect.left,
              width: rect.width,
            });
          }

          // Focus the input element after a brief delay to ensure the input is rendered
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
              // Place cursor at the end of the input
              const length = atReference.length;
              inputRef.current.setSelectionRange(length, length);
            }
          }, 0);
        }
        setClickTimeout(null);
      }, 200); // 200ms threshold for double click

      setClickTimeout(timeout);
    }
  };

  const handleQueryChange = newValue => {
    if (newValue === 'none') {
      // Reset all states
      setIsQueryValue(false);
      setQueryType(null);
      setLocalValue('');
      debouncedUpdateFn('');
    } else {
      setLocalValue(newValue);
      debouncedUpdateFn(newValue);
    }
  };

  // Sync local value when prop value changes
  useEffect(() => {
    setLocalValue(value);
    checkAndParseJson(value);
  }, [value, checkAndParseJson]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateFn.cancel();
    };
  }, [debouncedUpdateFn]);

  // Update dropdown position when input changes or dropdown visibility changes
  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width+10,
      });
    }
  }, [showDropdown, localValue]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
    };
  }, [clickTimeout]);

  // Add handler
  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDelete = () => {
    console.log('Deleting path:', path); // Debug log
    deleteNamedChildAttribute(path);
    setContextMenu(null);
  };

  // Add useEffect for clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Determine flex direction based on name type
  const flexDirection = typeof name === 'string' ? 'flex-col' : 'flex-row';

  return (
    <div className={`flex ${flexDirection} items-center`} onContextMenu={handleContextMenu}>
      {isJsonObject && parsedObject ? (
        <InputShell label={name} hasContent={!!parsedObject}>
          <div onClick={handlePillClick} className="cursor-text" ref={pillRef}>
            <ObjectPill name={parsedObject.name} inline={parsedObject.is_inline_defined} />
          </div>
        </InputShell>
      ) : isQueryValue ? (
        <InputShell label={name} hasContent={!!localValue}>
          <QueryPill
            value={localValue}
            onChange={handleQueryChange}
            isQueryFunction={queryType === 'function'}
          />
        </InputShell>
      ) : (
        <div className="relative w-full">
          <Input
            ref={inputRef}
            value={localValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            name={name}
            label={name}
          />
          {showDropdown &&
            createPortal(
              <div
                className="fixed z-50 bg-white border border-primary-100 rounded-lg shadow-lg max-h-60 overflow-auto p-1"
                style={{
                  top: dropdownPosition.top ,
                  left: dropdownPosition.left,
                  width: dropdownPosition.width,
                }}
                ref={dropdownRef}
              >
                {filteredChildren.map((child, index) => (
                  <div
                    key={child}
                    className={`p-1 cursor-pointer rounded-md transition-colors ${
                      index === selectedIndex ? 'bg-primary-100 text-primary-700' : 'hover:bg-primary-50'
                    }`}
                    onClick={() => {
                      const reference = JSON.stringify({
                        name: child,
                        is_inline_defined: false,
                        original_value: `\${ref(${child})}`,
                      });
                      setLocalValue(reference);
                      checkAndParseJson(reference);
                      debouncedUpdateFn(reference);
                      setShowDropdown(false);
                    }}
                  >
                    <ObjectPill name={child} inline={false} disableDoubleClick={true} />
                  </div>
                ))}
              </div>,
              document.body
            )}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default AttributeComponent;
