import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaCalendarAlt, FaTimes } from 'react-icons/fa';
import { DropdownLabel } from '../../styled/DropdownButton';
import { format, parseISO, isValid, isBefore, isAfter, isSameDay } from 'date-fns';

/**
 * DateRangeInput - Multi-select input displayed as a date range picker.
 *
 * This is a display-only component - it receives selectedValues from props (store via parent)
 * and only calls setInputValue on user interaction.
 *
 * Best for: Multi-select inputs with date options where users want to select a
 * contiguous date range. Shows calendar-style date pickers for start and end dates.
 */
const DateRangeInput = ({
  label = '',
  options: rawOptions,
  selectedValues, // Current values from store (via parent) - array of ISO date strings
  name,
  setInputValue, // Only called on user interaction
}) => {
  const [dateOptions, setDateOptions] = useState([]);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const startRef = useRef(null);
  const endRef = useRef(null);

  // Convert options to Date objects and sort
  useEffect(() => {
    const dates = Array.isArray(rawOptions)
      ? rawOptions
          .map(o => {
            const date = typeof o === 'string' ? parseISO(o) : o;
            return isValid(date) ? { date, iso: format(date, 'yyyy-MM-dd') } : null;
          })
          .filter(d => d !== null)
          .sort((a, b) => a.date - b.date)
      : [];
    setDateOptions(dates);
  }, [rawOptions]);

  // Derive start and end dates from selectedValues
  const { startDate, endDate } = useMemo(() => {
    if (dateOptions.length === 0) {
      return { startDate: null, endDate: null };
    }

    if (!selectedValues || !Array.isArray(selectedValues) || selectedValues.length === 0) {
      return { startDate: null, endDate: null };
    }

    // Find earliest and latest selected dates
    const selectedDates = selectedValues
      .map(v => {
        const date = typeof v === 'string' ? parseISO(v) : v;
        return isValid(date) ? date : null;
      })
      .filter(d => d !== null)
      .sort((a, b) => a - b);

    if (selectedDates.length === 0) {
      return { startDate: null, endDate: null };
    }

    return {
      startDate: selectedDates[0],
      endDate: selectedDates[selectedDates.length - 1],
    };
  }, [selectedValues, dateOptions]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = event => {
      if (startRef.current && !startRef.current.contains(event.target)) {
        setIsStartOpen(false);
      }
      if (endRef.current && !endRef.current.contains(event.target)) {
        setIsEndOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update selection when dates change
  const updateSelection = (newStart, newEnd) => {
    if (!setInputValue || !name) return;

    // Ensure start is before end
    let effectiveStart = newStart;
    let effectiveEnd = newEnd;

    if (effectiveStart && effectiveEnd && isAfter(effectiveStart, effectiveEnd)) {
      // Swap if start is after end
      [effectiveStart, effectiveEnd] = [effectiveEnd, effectiveStart];
    }

    // Find all options within the range
    const selectedOptions = dateOptions
      .filter(opt => {
        if (!effectiveStart && !effectiveEnd) return false;
        if (!effectiveStart) return isSameDay(opt.date, effectiveEnd) || isBefore(opt.date, effectiveEnd);
        if (!effectiveEnd) return isSameDay(opt.date, effectiveStart) || isAfter(opt.date, effectiveStart);
        return (
          (isSameDay(opt.date, effectiveStart) || isAfter(opt.date, effectiveStart)) &&
          (isSameDay(opt.date, effectiveEnd) || isBefore(opt.date, effectiveEnd))
        );
      })
      .map(opt => opt.iso);

    setInputValue(name, selectedOptions);
  };

  const handleStartSelect = dateOpt => {
    updateSelection(dateOpt.date, endDate);
    setIsStartOpen(false);
  };

  const handleEndSelect = dateOpt => {
    updateSelection(startDate, dateOpt.date);
    setIsEndOpen(false);
  };

  const clearSelection = e => {
    e.stopPropagation();
    if (setInputValue && name) {
      setInputValue(name, []);
    }
  };

  const formatDisplayDate = date => {
    if (!date) return '';
    return format(date, 'MMM d, yyyy');
  };

  // Group dates by month for calendar display
  const groupedDates = useMemo(() => {
    const groups = {};
    dateOptions.forEach(opt => {
      const monthKey = format(opt.date, 'yyyy-MM');
      if (!groups[monthKey]) {
        groups[monthKey] = {
          label: format(opt.date, 'MMMM yyyy'),
          dates: [],
        };
      }
      groups[monthKey].dates.push(opt);
    });
    return Object.values(groups);
  }, [dateOptions]);

  const renderDatePicker = (isOpen, onSelect, selectedDate, otherDate, isStart) => {
    if (!isOpen) return null;

    return (
      <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto min-w-[200px]">
        {groupedDates.map((group, groupIdx) => (
          <div key={groupIdx}>
            <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 sticky top-0">
              {group.label}
            </div>
            <div className="grid grid-cols-7 gap-1 p-2">
              {group.dates.map((opt, idx) => {
                const isSelected = selectedDate && isSameDay(opt.date, selectedDate);
                const isInRange =
                  startDate &&
                  endDate &&
                  isAfter(opt.date, startDate) &&
                  isBefore(opt.date, endDate);
                const isOtherEnd = otherDate && isSameDay(opt.date, otherDate);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelect(opt)}
                    className={`
                      w-8 h-8 text-xs rounded-full flex items-center justify-center
                      transition-colors cursor-pointer
                      ${isSelected ? 'bg-blue-600 text-white' : ''}
                      ${isInRange && !isSelected ? 'bg-blue-100 text-blue-700' : ''}
                      ${isOtherEnd && !isSelected ? 'bg-blue-200 text-blue-700' : ''}
                      ${!isSelected && !isInRange && !isOtherEnd ? 'hover:bg-gray-100 text-gray-700' : ''}
                    `}
                  >
                    {format(opt.date, 'd')}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groupedDates.length === 0 && (
          <div className="p-4 text-sm text-gray-500 text-center">No dates available</div>
        )}
      </div>
    );
  };

  if (dateOptions.length === 0) {
    return (
      <div className="w-full min-w-[300px]">
        {label && <DropdownLabel>{label}</DropdownLabel>}
        <div className="text-gray-500 text-sm">No date options available</div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[300px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="flex items-center gap-2">
        {/* Start Date Picker */}
        <div className="relative flex-1" ref={startRef}>
          <button
            type="button"
            onClick={() => {
              setIsStartOpen(!isStartOpen);
              setIsEndOpen(false);
            }}
            className={`
              w-full px-3 py-2 text-sm border rounded-lg text-left
              flex items-center justify-between gap-2
              transition-colors cursor-pointer
              ${isStartOpen ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}
            `}
          >
            <div className="flex items-center gap-2">
              <FaCalendarAlt className="w-3 h-3 text-gray-400" />
              <span className={startDate ? 'text-gray-900' : 'text-gray-400'}>
                {startDate ? formatDisplayDate(startDate) : 'Start date'}
              </span>
            </div>
          </button>
          {renderDatePicker(isStartOpen, handleStartSelect, startDate, endDate, true)}
        </div>

        <span className="text-gray-400">to</span>

        {/* End Date Picker */}
        <div className="relative flex-1" ref={endRef}>
          <button
            type="button"
            onClick={() => {
              setIsEndOpen(!isEndOpen);
              setIsStartOpen(false);
            }}
            className={`
              w-full px-3 py-2 text-sm border rounded-lg text-left
              flex items-center justify-between gap-2
              transition-colors cursor-pointer
              ${isEndOpen ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'}
            `}
          >
            <div className="flex items-center gap-2">
              <FaCalendarAlt className="w-3 h-3 text-gray-400" />
              <span className={endDate ? 'text-gray-900' : 'text-gray-400'}>
                {endDate ? formatDisplayDate(endDate) : 'End date'}
              </span>
            </div>
          </button>
          {renderDatePicker(isEndOpen, handleEndSelect, endDate, startDate, false)}
        </div>

        {/* Clear Button */}
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={clearSelection}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear selection"
          >
            <FaTimes className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Selection Summary */}
      {selectedValues && selectedValues.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          {selectedValues.length} date{selectedValues.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
};

export default DateRangeInput;
