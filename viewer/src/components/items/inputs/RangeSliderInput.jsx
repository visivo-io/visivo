import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DropdownLabel } from '../../styled/DropdownButton';

/**
 * RangeSliderInput - Multi-select input displayed as a two-handle range slider.
 *
 * This is a display-only component - it receives selectedValues from props (store via parent)
 * and only calls setInputValue on user interaction.
 *
 * Best for: Numeric ranges where users need to select a min and max value.
 * Options should be numeric or convertible to numbers.
 */
const RangeSliderInput = ({
  label = '',
  options: rawOptions,
  selectedValues: propSelectedValues, // Current values from store (via parent)
  name,
  setInputValue, // Only called on user interaction
}) => {
  const [numericOptions, setNumericOptions] = useState([]);
  const sliderRef = useRef(null);

  // Convert options to numbers and sort
  useEffect(() => {
    const nums = Array.isArray(rawOptions)
      ? rawOptions
          .map(o => (typeof o === 'number' ? o : parseFloat(o)))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b)
      : [];
    setNumericOptions(nums);
  }, [rawOptions]);

  // Derive min/max values from propSelectedValues
  const { minValue, maxValue } = useMemo(() => {
    if (numericOptions.length < 2) {
      return { minValue: 0, maxValue: 100 };
    }

    const rangeMin = numericOptions[0];
    const rangeMax = numericOptions[numericOptions.length - 1];

    if (!propSelectedValues || propSelectedValues.length === 0) {
      // If no selection, default to full range
      return { minValue: rangeMin, maxValue: rangeMax };
    }

    // propSelectedValues contains the values within the current range
    const selectedNums = propSelectedValues
      .map(v => (typeof v === 'number' ? v : parseFloat(v)))
      .filter(n => !isNaN(n));

    if (selectedNums.length === 0) {
      return { minValue: rangeMin, maxValue: rangeMax };
    }

    return {
      minValue: Math.min(...selectedNums),
      maxValue: Math.max(...selectedNums),
    };
  }, [propSelectedValues, numericOptions]);

  const handleMinChange = e => {
    const value = parseFloat(e.target.value);
    const newMin = Math.min(value, maxValue);

    // Get all values within the new range
    const selectedValues = numericOptions.filter(v => v >= newMin && v <= maxValue);

    // Only call setInputValue on user interaction
    if (setInputValue) {
      setInputValue(name, selectedValues);
    }
  };

  const handleMaxChange = e => {
    const value = parseFloat(e.target.value);
    const newMax = Math.max(value, minValue);

    // Get all values within the new range
    const selectedValues = numericOptions.filter(v => v >= minValue && v <= newMax);

    // Only call setInputValue on user interaction
    if (setInputValue) {
      setInputValue(name, selectedValues);
    }
  };

  if (numericOptions.length < 2) {
    return (
      <div className="w-full min-w-[200px]">
        {label && <DropdownLabel>{label}</DropdownLabel>}
        <div className="text-red-500 text-sm">Range slider requires at least 2 numeric options</div>
      </div>
    );
  }

  const rangeMin = numericOptions[0];
  const rangeMax = numericOptions[numericOptions.length - 1];
  const minPercent = ((minValue - rangeMin) / (rangeMax - rangeMin)) * 100;
  const maxPercent = ((maxValue - rangeMin) / (rangeMax - rangeMin)) * 100;

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="px-2 py-1">
        {/* Selected range display - centered and prominent */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-lg font-semibold text-blue-600 tabular-nums">{minValue}</span>
          <span className="text-gray-400 text-sm">—</span>
          <span className="text-lg font-semibold text-blue-600 tabular-nums">{maxValue}</span>
        </div>

        {/* Slider track with range labels integrated */}
        <div className="relative" ref={sliderRef}>
          {/* Range min/max labels - subtle, above the track */}
          <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
            <span>{rangeMin}</span>
            <span>{rangeMax}</span>
          </div>

          {/* Track container */}
          <div className="relative h-8">
            {/* Background track */}
            <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 bg-gray-300 rounded-full" />

            {/* Selected range track */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-500 rounded-full pointer-events-none"
              style={{
                left: `${minPercent}%`,
                width: `${maxPercent - minPercent}%`,
              }}
            />

            {/* Visual thumb for min value */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg pointer-events-none"
              style={{ left: `calc(${minPercent}% - 10px)` }}
            />

            {/* Visual thumb for max value */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg pointer-events-none"
              style={{ left: `calc(${maxPercent}% - 10px)` }}
            />

            {/* Min slider - always on top on left side of midpoint */}
            <input
              type="range"
              min={rangeMin}
              max={rangeMax}
              value={minValue}
              onChange={handleMinChange}
              className="absolute top-0 w-full h-full opacity-0 cursor-pointer"
              style={{
                zIndex: 4,
                clipPath: `inset(0 ${100 - (minPercent + maxPercent) / 2}% 0 0)`,
              }}
            />

            {/* Max slider - always on top on right side of midpoint */}
            <input
              type="range"
              min={rangeMin}
              max={rangeMax}
              value={maxValue}
              onChange={handleMaxChange}
              className="absolute top-0 w-full h-full opacity-0 cursor-pointer"
              style={{
                zIndex: 4,
                clipPath: `inset(0 0 0 ${(minPercent + maxPercent) / 2}%)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RangeSliderInput;
