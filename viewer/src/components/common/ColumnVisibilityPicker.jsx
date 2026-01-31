import React, { useState, useRef, useEffect } from 'react';

const ColumnVisibilityPicker = ({ table }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allColumns = table.getAllLeafColumns();
  const visibleCount = table.getVisibleLeafColumns().length;

  return (
    <div className="relative" ref={ref}>
      <button
        className="text-xs text-secondary-500 hover:text-secondary-700 transition-colors"
        onClick={() => setOpen(prev => !prev)}
      >
        Columns ({visibleCount}/{allColumns.length})
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 bg-white border border-secondary-200 rounded shadow-lg p-2 z-20 max-h-60 overflow-y-auto min-w-[180px]">
          {allColumns.map(column => (
            <label
              key={column.id}
              className="flex items-center gap-2 px-2 py-1 hover:bg-secondary-50 rounded cursor-pointer text-xs text-secondary-700"
            >
              <input
                type="checkbox"
                checked={column.getIsVisible()}
                onChange={column.getToggleVisibilityHandler()}
                className="rounded border-secondary-300"
              />
              {column.id}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default ColumnVisibilityPicker;
