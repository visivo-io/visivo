import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaCalendarAlt, FaTimes, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { DropdownLabel } from '../../styled/DropdownButton';
import {
  format,
  parseISO,
  isValid,
  isBefore,
  isAfter,
  isSameDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns';

/**
 * DateRangeInput - Multi-select input displayed as a date range picker.
 *
 * This is a display-only component - it receives selectedValues from props (store via parent)
 * and only calls setInputJobValue on user interaction.
 *
 * Best for: Multi-select inputs with date options where users want to select a
 * contiguous date range. Shows calendar-style date pickers for start and end dates.
 */
const DateRangeInput = ({
  label = '',
  options: rawOptions,
  selectedValues, // Current values from store (via parent) - array of ISO date strings
  name,
  setInputJobValue, // Only called on user interaction
}) => {
  const [dateOptions, setDateOptions] = useState([]);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const [startViewMonth, setStartViewMonth] = useState(new Date());
  const [endViewMonth, setEndViewMonth] = useState(new Date());
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

  // Initialize view months when dateOptions change
  useEffect(() => {
    if (dateOptions.length > 0) {
      const firstDate = dateOptions[0].date;
      const lastDate = dateOptions[dateOptions.length - 1].date;
      setStartViewMonth(firstDate);
      setEndViewMonth(lastDate);
    }
  }, [dateOptions]);

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
    if (!setInputJobValue || !name) return;

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
        if (!effectiveStart)
          return isSameDay(opt.date, effectiveEnd) || isBefore(opt.date, effectiveEnd);
        if (!effectiveEnd)
          return isSameDay(opt.date, effectiveStart) || isAfter(opt.date, effectiveStart);
        return (
          (isSameDay(opt.date, effectiveStart) || isAfter(opt.date, effectiveStart)) &&
          (isSameDay(opt.date, effectiveEnd) || isBefore(opt.date, effectiveEnd))
        );
      })
      .map(opt => opt.iso);

    setInputJobValue(name, selectedOptions);
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
    if (setInputJobValue && name) {
      setInputJobValue(name, []);
    }
  };

  const formatDisplayDate = date => {
    if (!date) return '';
    return format(date, 'MMM d, yyyy');
  };

  // Create a set of available date ISO strings for quick lookup
  const availableDatesSet = useMemo(() => {
    return new Set(dateOptions.map(opt => opt.iso));
  }, [dateOptions]);

  // Get the date range bounds from available options
  const { minDate, maxDate } = useMemo(() => {
    if (dateOptions.length === 0) return { minDate: null, maxDate: null };
    return {
      minDate: dateOptions[0].date,
      maxDate: dateOptions[dateOptions.length - 1].date,
    };
  }, [dateOptions]);

  // Generate calendar grid for a given month
  const generateCalendarDays = viewMonth => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Add padding for days before the first day of month (to align with weekday columns)
    const startPadding = getDay(monthStart); // 0 = Sunday, 6 = Saturday
    const paddedDays = [];

    // Add empty slots for padding
    for (let i = 0; i < startPadding; i++) {
      paddedDays.push({ date: null, iso: null, isPadding: true });
    }

    // Add actual days
    days.forEach(date => {
      const iso = format(date, 'yyyy-MM-dd');
      paddedDays.push({
        date,
        iso,
        isPadding: false,
        isAvailable: availableDatesSet.has(iso),
      });
    });

    return paddedDays;
  };

  const renderDatePicker = (isOpen, onSelect, selectedDate, otherDate, viewMonth, setViewMonth) => {
    if (!isOpen) return null;

    const calendarDays = generateCalendarDays(viewMonth);
    // Allow navigation if we're not at the first/last month with available dates
    const canGoPrev = minDate && isAfter(startOfMonth(viewMonth), startOfMonth(minDate));
    const canGoNext = maxDate && isBefore(endOfMonth(viewMonth), endOfMonth(maxDate));

    return (
      <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[280px]">
        {/* Month/Year Navigation Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setViewMonth(subMonths(viewMonth, 1))}
            disabled={!canGoPrev}
            className={`p-1 rounded hover:bg-gray-100 transition-colors ${
              !canGoPrev ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
            }`}
            aria-label="Previous month"
          >
            <FaChevronLeft className="w-3 h-3 text-gray-600" />
          </button>

          <span className="text-sm font-medium text-gray-700">
            {format(viewMonth, 'MMMM yyyy')}
          </span>

          <button
            type="button"
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            disabled={!canGoNext}
            className={`p-1 rounded hover:bg-gray-100 transition-colors ${
              !canGoNext ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
            }`}
            aria-label="Next month"
          >
            <FaChevronRight className="w-3 h-3 text-gray-600" />
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 px-2 pt-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day} className="w-8 h-6 text-xs text-gray-400 text-center font-medium">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 p-2">
          {calendarDays.map((day, idx) => {
            if (day.isPadding) {
              return <div key={`pad-${idx}`} className="w-8 h-8" />;
            }

            const isSelected = selectedDate && isSameDay(day.date, selectedDate);
            const isInRange =
              startDate && endDate && isAfter(day.date, startDate) && isBefore(day.date, endDate);
            const isOtherEnd = otherDate && isSameDay(day.date, otherDate);
            const isDisabled = !day.isAvailable;

            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => {
                  if (!isDisabled) {
                    onSelect({ date: day.date, iso: day.iso });
                  }
                }}
                disabled={isDisabled}
                className={`
                  w-8 h-8 text-xs rounded-full flex items-center justify-center
                  transition-colors
                  ${isSelected ? 'bg-blue-600 text-white' : ''}
                  ${isInRange && !isSelected ? 'bg-blue-100 text-blue-700' : ''}
                  ${isOtherEnd && !isSelected ? 'bg-blue-200 text-blue-700' : ''}
                  ${isDisabled ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer'}
                  ${!isSelected && !isInRange && !isOtherEnd && !isDisabled ? 'hover:bg-gray-100 text-gray-700' : ''}
                `}
              >
                {format(day.date, 'd')}
              </button>
            );
          })}
        </div>

        {dateOptions.length === 0 && (
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
          {renderDatePicker(
            isStartOpen,
            handleStartSelect,
            startDate,
            endDate,
            startViewMonth,
            setStartViewMonth
          )}
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
          {renderDatePicker(
            isEndOpen,
            handleEndSelect,
            endDate,
            startDate,
            endViewMonth,
            setEndViewMonth
          )}
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
