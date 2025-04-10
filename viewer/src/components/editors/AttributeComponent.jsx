import useStore from '../../stores/store'; // Adjust path to Zustand store
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import debounce from 'lodash/debounce'; // You'll need to install lodash if not already present
import ObjectPill from './ObjectPill'; // You'll need to create this component if it doesn't exist
import { createPortal } from 'react-dom';

function AttributeComponent({ name, value, path,}) {
  const updateNamedChildAttribute = useStore((state) => state.updateNamedChildAttribute);
  const namedChildren = useStore((state) => state.namedChildren);
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

  // Check if value is valid JSON object with required structure
  const checkAndParseJson = useCallback((val) => {
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
    (newValue) => {
      updateNamedChildAttribute(path, newValue);
    },
    [path, updateNamedChildAttribute]
  );

  // Create the debounced version outside the callback
  const debouncedUpdateFn = useMemo(
    () => debounce(debouncedUpdate, 300),
    [debouncedUpdate]
  );

  // Update local value immediately but debounce the store update
  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Handle @ mentions
    if (newValue.includes('@')) {
      const searchTerm = newValue.split('@').pop()?.toLowerCase() || '';
      const filtered = Object.keys(namedChildren).filter(
        child => child.toLowerCase().includes(searchTerm)
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
  const scrollSelectedIntoView = useCallback((index) => {
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
  const handleKeyDown = (e) => {
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

  const handlePillClick = (e) => {
    e.preventDefault();
    
    if (clickTimeout) {
      // Double click detected
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      // Don't do anything here - let the ObjectPill handle double click
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
        }
        setClickTimeout(null);
      }, 200); // 200ms threshold for double click

      setClickTimeout(timeout);
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
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
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

  // Determine flex direction based on name type
  const flexDirection = typeof name === 'string' ? 'flex-col' : 'flex-row';

  return (
    <div className={`flex ${flexDirection}`}>
       <span className="text-sm p-1 font-medium text-grey-400">{name}</span>
      
      {isJsonObject && parsedObject ? (
        <div onClick={handlePillClick} className="cursor-text">
          <ObjectPill 
            name={parsedObject.name} 
            inline={parsedObject.is_inline_defined}
          />
        </div>
      ) : (
        <div className="relative w-full">
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-300 rounded-md shadow-md focus:ring-blue-500 focus:border-blue-500 p-2"
          />
          {showDropdown && createPortal(
            <div 
              className="fixed z-50 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto p-1"
              style={{
                top: dropdownPosition.top + 4,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
              }}
              ref={dropdownRef}
            >
              {filteredChildren.map((child, index) => (
                <div
                  key={child}
                  className={`p-1 cursor-pointer rounded-md ${
                    index === selectedIndex ? 'bg-gray-100' : ''
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
                  <ObjectPill 
                    name={child} 
                    inline={false}
                    disableDoubleClick={true}
                  />
                </div>
              ))}
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
}

export default AttributeComponent;