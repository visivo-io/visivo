import React, { useState, useRef, useEffect } from 'react';
import { PiPlus, PiX, PiCheckCircle, PiWarningCircle } from 'react-icons/pi';

const AddComputedColumnPopover = ({ onAdd, onValidate, existingNames }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [type, setType] = useState('metric');
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const popoverRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleValidate = async () => {
    if (!expression.trim()) return;
    setIsValidating(true);
    setValidationResult(null);
    const result = await onValidate(expression.trim());
    setValidationResult(result);
    setIsValidating(false);
  };

  const handleAdd = () => {
    if (!name.trim() || !expression.trim()) return;
    if (existingNames?.has(name.trim())) {
      setValidationResult({ valid: false, error: `Column "${name.trim()}" already exists` });
      return;
    }
    onAdd({ name: name.trim(), expression: expression.trim(), type });
    setName('');
    setExpression('');
    setType('metric');
    setValidationResult(null);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setName('');
    setExpression('');
    setType('metric');
    setValidationResult(null);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded hover:bg-secondary-200 text-secondary-400 hover:text-secondary-600 transition-colors"
        title="Add computed column"
        data-testid="add-computed-column-btn"
      >
        <PiPlus size={14} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-30 bg-white border border-secondary-200 rounded-lg shadow-lg p-4 w-80"
          data-testid="add-computed-column-popover"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-secondary-800">Add Computed Column</span>
            <button
              type="button"
              onClick={handleCancel}
              className="p-0.5 text-secondary-400 hover:text-secondary-600"
              data-testid="popover-close"
            >
              <PiX size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-secondary-600 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., total_revenue"
                className="w-full px-2 py-1.5 text-xs border border-secondary-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                data-testid="computed-col-name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-secondary-600 mb-1">
                SQL Expression
              </label>
              <textarea
                value={expression}
                onChange={(e) => {
                  setExpression(e.target.value);
                  setValidationResult(null);
                }}
                placeholder="e.g., SUM(amount)"
                rows={3}
                className="w-full px-2 py-1.5 text-xs font-mono border border-secondary-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                data-testid="computed-col-expression"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-secondary-600 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-secondary-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                data-testid="computed-col-type"
              >
                <option value="metric">Metric (aggregate with OVER())</option>
                <option value="dimension">Dimension (row-level)</option>
              </select>
            </div>

            {validationResult && (
              <div
                className={`flex items-start gap-1.5 text-xs ${
                  validationResult.valid ? 'text-green-600' : 'text-highlight'
                }`}
                data-testid="validation-result"
              >
                {validationResult.valid ? (
                  <PiCheckCircle size={14} className="flex-shrink-0 mt-0.5" />
                ) : (
                  <PiWarningCircle size={14} className="flex-shrink-0 mt-0.5" />
                )}
                <span>
                  {validationResult.valid ? 'Expression is valid' : validationResult.error}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleValidate}
                disabled={!expression.trim() || isValidating}
                className="px-3 py-1.5 text-xs font-medium text-secondary-700 bg-secondary-100 hover:bg-secondary-200 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="validate-btn"
              >
                {isValidating ? 'Validating...' : 'Validate'}
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!name.trim() || !expression.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="add-btn"
              >
                Add
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-medium text-secondary-500 hover:text-secondary-700 transition-colors"
                data-testid="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddComputedColumnPopover;
