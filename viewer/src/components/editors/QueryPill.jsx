import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QUERY_FUNCTION_PATTERN, QUERY_BRACKET_PATTERN } from '../../utils/queryString';

function QueryPill({ value, onChange, isQueryFunction, inputShellRef }) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef(null);
  const pillRef = useRef(null);
  const [pillRect, setPillRect] = useState(null);

  useEffect(() => {
    if (isEditing && pillRef.current && inputShellRef?.current) {
      const pillRect = pillRef.current.getBoundingClientRect();
      const shellRect = inputShellRef.current.getBoundingClientRect();
      setPillRect({
        ...pillRect,
        left: shellRect.left,
        top: pillRect.top,
        width: shellRect.width,
      });
    }
  }, [isEditing, inputShellRef]);

  const handleClick = () => {
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    // Extract just the capture value without the wrapper
    const captureValue = isQueryFunction
      ? localValue.replace(QUERY_FUNCTION_PATTERN, '$1')
      : localValue.replace(QUERY_BRACKET_PATTERN, '$1');

    // Reconstruct the full string with proper wrapper
    const newValue = isQueryFunction ? `query(${captureValue})` : `?{${captureValue}}`;

    onChange(newValue);
  };

  const handleDelete = e => {
    e.stopPropagation(); // Prevent pill click
    onChange('none');
  };

  const displayValue = isQueryFunction
    ? localValue.replace(QUERY_FUNCTION_PATTERN, '$1')
    : localValue.replace(QUERY_BRACKET_PATTERN, '$1');

  const pillContent = (
    <>
      {/* Left moon with SQL text - now self-stretches and centers content */}
      <div className="flex items-center self-stretch px-3 border-r border-white shrink-0">
        <span className="text-sm font-semibold text-blue-900">SQL</span>
      </div>
      {/* Main content */}
      <div className="flex-1 px-3 py-1 min-w-0 w-full flex items-center">
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={displayValue}
            onChange={e => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            className="bg-transparent text-blue-900 outline-none w-full resize-none overflow-visible min-h-[2rem] rounded-xsm"
            rows={1}
            style={{ height: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
          />
        ) : (
          <span className="text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis block w-full">
            {displayValue}
          </span>
        )}
      </div>
      {/* Delete button container - always present */}
      <div className="flex items-center self-stretch px-2 shrink-0 w-8">
        {isHovered && !isEditing && (
          <button
            onClick={handleDelete}
            className="w-4 h-4 flex items-center justify-center text-blue-900 hover:text-blue-700 focus:outline-none"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </>
  );

  if (isEditing && pillRect) {
    return createPortal(
      <div
        className="relative inline-flex items-stretch min-h-[2rem] max-h-[none] rounded-xl shadow-md bg-blue-100 border-2 border-white shadow-lg z-50"
        style={{
          position: 'fixed',
          left: pillRect.left,
          top: pillRect.top - 10,
          width: pillRect.width,
          maxWidth: '90vw',
        }}
      >
        {pillContent}
      </div>,
      document.body
    );
  }

  return (
    <div
      ref={pillRef}
      className="relative inline-flex items-stretch min-h-[2rem] max-h-[4rem] rounded-full bg-blue-100 border-2 border-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] cursor-text overflow-hidden"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {pillContent}
    </div>
  );
}

export default QueryPill;
