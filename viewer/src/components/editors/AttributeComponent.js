import useStore from '../../stores/store'; // Adjust path to Zustand store
import { useState, useEffect, useCallback } from 'react';
import debounce from 'lodash/debounce'; // You'll need to install lodash if not already present
import ObjectPill from './ObjectPill'; // You'll need to create this component if it doesn't exist

function AttributeComponent({ name, value, path,}) {
  const updateNamedChildAttribute = useStore((state) => state.updateNamedChildAttribute);
  const [localValue, setLocalValue] = useState(value);
  const [isJsonObject, setIsJsonObject] = useState(false);
  const [parsedObject, setParsedObject] = useState(null);

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
    debounce((newValue) => {
      updateNamedChildAttribute(path, newValue);
    }, 300), // 300ms delay
    [path]
  );

  // Update local value immediately but debounce the store update
  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    checkAndParseJson(newValue);
    debouncedUpdate(newValue);
  };

  // Sync local value when prop value changes
  useEffect(() => {
    setLocalValue(value);
    checkAndParseJson(value);
  }, [value, checkAndParseJson]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  // Determine flex direction based on name type
  const flexDirection = typeof name === 'string' ? 'flex-col' : 'flex-row';

  return (
    <div className={`flex ${flexDirection}`}>
       <span className="text-sm p-1 font-medium text-grey-400">{name}</span>
      
      {isJsonObject && parsedObject ? (
        
          <ObjectPill name={parsedObject.name} />
        
      ) : (
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-md shadow-md focus:ring-blue-500 focus:border-blue-500 p-2"
        />
      )}
    </div>
  );
}

export default AttributeComponent;