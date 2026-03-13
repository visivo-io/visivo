import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PiPlus, PiX, PiCheckCircle, PiWarningCircle, PiSpinner } from 'react-icons/pi';

const DEBOUNCE_MS = 750;

const AddComputedColumnPopover = ({ onAdd, onValidate, existingNames }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [detectedType, setDetectedType] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const debounceRef = useRef(null);

  // Position the popover above the button when opened
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPopoverPos({
      top: rect.top,
      left: rect.right,
    });
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runValidation = useCallback(
    async (expr) => {
      if (!expr.trim()) {
        setValidationResult(null);
        setDetectedType(null);
        return;
      }
      setIsValidating(true);
      setValidationResult(null);
      const result = await onValidate(expr.trim());
      setValidationResult(result);
      if (result?.valid && result?.detectedType) {
        setDetectedType(result.detectedType);
      } else if (!result?.valid) {
        setDetectedType(null);
      }
      setIsValidating(false);
    },
    [onValidate]
  );

  const handleExpressionChange = (e) => {
    const val = e.target.value;
    setExpression(val);
    setValidationResult(null);
    setDetectedType(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runValidation(val);
    }, DEBOUNCE_MS);
  };

  const handleAdd = () => {
    if (!name.trim() || !expression.trim()) return;
    if (existingNames?.has(name.trim())) {
      setValidationResult({ valid: false, error: `Column "${name.trim()}" already exists` });
      return;
    }
    const type = detectedType || 'dimension';
    onAdd({ name: name.trim(), expression: expression.trim(), type });
    setName('');
    setExpression('');
    setValidationResult(null);
    setDetectedType(null);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setName('');
    setExpression('');
    setValidationResult(null);
    setDetectedType(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsOpen(false);
  };

  const popoverContent = isOpen && createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999] bg-white border border-secondary-200 rounded-lg shadow-lg p-4 w-80"
      style={{
        top: popoverPos.top,
        left: popoverPos.left,
        transform: 'translate(-100%, -100%)',
      }}
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
            onChange={handleExpressionChange}
            placeholder="e.g., SUM(amount)"
            rows={3}
            className="w-full px-2 py-1.5 text-xs font-mono border border-secondary-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            data-testid="computed-col-expression"
          />
        </div>

        {isValidating && (
          <div className="flex items-center gap-1.5 text-xs text-secondary-400" data-testid="validating-indicator">
            <PiSpinner size={14} className="animate-spin" />
            <span>Validating...</span>
          </div>
        )}

        {validationResult && !isValidating && (
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
              {validationResult.valid ? (
                <>
                  Valid expression
                  {detectedType && (
                    <span
                      className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        detectedType === 'metric'
                          ? 'bg-cyan-100 text-cyan-700'
                          : 'bg-teal-100 text-teal-700'
                      }`}
                      data-testid="detected-type-badge"
                    >
                      {detectedType === 'metric' ? 'Metric' : 'Dimension'}
                    </span>
                  )}
                </>
              ) : (
                validationResult.error
              )}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
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
    </div>,
    document.body
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded hover:bg-secondary-200 text-secondary-400 hover:text-secondary-600 transition-colors"
        title="Add computed column"
        data-testid="add-computed-column-btn"
      >
        <PiPlus size={14} />
      </button>
      {popoverContent}
    </div>
  );
};

export default AddComputedColumnPopover;
