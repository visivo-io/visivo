import { useState, useRef } from 'react';

function QueryPill({ value, onChange, isQueryFunction }) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef(null);

  const handleClick = () => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    // Extract just the capture value without the wrapper
    const captureValue = isQueryFunction ? 
      localValue.replace(/^query\((.*)\)$/, '$1') :
      localValue.replace(/^\?\{(.*)\}$/, '$1');
    
    // Reconstruct the full string with proper wrapper
    const newValue = isQueryFunction ? 
      `query(${captureValue})` :
      `?{${captureValue}}`;
    
    onChange(newValue);
  };

  const handleDelete = (e) => {
    e.stopPropagation(); // Prevent pill click
    onChange('none');
  };

  const displayValue = isQueryFunction ? 
    localValue.replace(/^query\((.*)\)$/, '$1') :
    localValue.replace(/^\?\{(.*)\}$/, '$1');

  return (
    <div 
      className="relative inline-flex items-center h-8 rounded-full bg-blue-100 border-2 border-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] cursor-text"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left moon with SQL text */}
      <div className="flex items-center h-full px-3 border-r border-white">
        <span className="text-sm font-semibold text-blue-900">SQL</span>
      </div>

      {/* Main content */}
      <div className="px-3 flex-grow">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            className="bg-transparent text-blue-900 outline-none w-full"
            size={displayValue.length}
          />
        ) : (
          <span className="text-blue-900">{displayValue}</span>
        )}
      </div>

      {/* Delete button */}
      {isHovered && !isEditing && (
        <button
          onClick={handleDelete}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-blue-900 hover:text-blue-700 focus:outline-none"
        >
          <svg 
            viewBox="0 0 20 20" 
            fill="currentColor" 
            className="w-4 h-4"
          >
            <path 
              fillRule="evenodd" 
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
              clipRule="evenodd" 
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export default QueryPill; 