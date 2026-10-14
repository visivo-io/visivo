import React, { useMemo } from 'react';
import { DropdownLabel } from '../../styled/DropdownButton';

/**
 * SliderInput - Single-select input displayed as a slider.
 *
 * This is a display-only component - it receives selectedValue from props (store via parent)
 * and only calls setInputJobValue on user interaction.
 *
 * Best for: Single-select inputs where users want to slide between discrete
 * values (numbers or text, in list order). Shows tick marks for each option.
 */
const SliderInput = ({
  label = '',
  options: rawOptions,
  selectedValue, // Current value from store (via parent)
  name,
  setInputJobValue, // Only called on user interaction
}) => {
  // The slider is an index over the options in LIST ORDER. Only when every option
  // is numeric are they sorted (and handed to the store as numbers); otherwise
  // each scalar option keeps its position and is stored as given.
  const { options, isNumeric } = useMemo(() => {
    const scalars = Array.isArray(rawOptions)
      ? rawOptions.filter(o => o !== null && o !== undefined && typeof o !== 'object')
      : [];
    const asNumber = o => (typeof o === 'number' ? o : o === '' ? NaN : Number(o));
    const allNumeric = scalars.length > 0 && scalars.every(o => Number.isFinite(asNumber(o)));
    if (allNumeric) {
      return { options: scalars.map(asNumber).sort((a, b) => a - b), isNumeric: true };
    }
    return { options: scalars, isNumeric: false };
  }, [rawOptions]);

  // Derive current value and index from selectedValue prop
  const { currentValue, currentIndex } = useMemo(() => {
    if (options.length === 0) {
      return { currentValue: 0, currentIndex: 0 };
    }

    if (selectedValue === null || selectedValue === undefined) {
      // Default to first option
      return { currentValue: options[0], currentIndex: 0 };
    }

    if (!isNumeric) {
      const idx = options.findIndex(o => String(o) === String(selectedValue));
      const index = idx === -1 ? 0 : idx;
      return { currentValue: options[index], currentIndex: index };
    }

    const numVal = typeof selectedValue === 'number' ? selectedValue : parseFloat(selectedValue);
    const index = options.indexOf(numVal);

    if (index !== -1) {
      return { currentValue: numVal, currentIndex: index };
    }

    // Find closest value if exact match not found
    let closestIndex = 0;
    let minDiff = Math.abs(options[0] - numVal);

    for (let i = 1; i < options.length; i++) {
      const diff = Math.abs(options[i] - numVal);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    return { currentValue: options[closestIndex], currentIndex: closestIndex };
  }, [selectedValue, options, isNumeric]);

  const handleChange = e => {
    const index = parseInt(e.target.value, 10);
    const value = options[index];

    if (setInputJobValue && name) {
      setInputJobValue(name, value);
    }
  };

  if (options.length < 2) {
    return (
      <div className="w-full min-w-[200px]">
        {label && <DropdownLabel>{label}</DropdownLabel>}
        <div className="text-red-500 text-sm">Slider requires at least 2 options</div>
      </div>
    );
  }

  const minVal = options[0];
  const maxVal = options[options.length - 1];
  const valuePercent = (currentIndex / (options.length - 1)) * 100;

  // Determine which tick labels to show to avoid crowding
  const showTickLabels = options.length <= 10;
  const showOnlyEndLabels = options.length > 10;

  return (
    <div className="w-full min-w-[200px]">
      {label && <DropdownLabel>{label}</DropdownLabel>}
      <div className="px-2 py-1">
        {/* Current value display - centered and prominent */}
        <div className="flex items-center justify-center mb-3">
          <span className="text-lg font-semibold text-blue-600 tabular-nums">{currentValue}</span>
        </div>

        {/* Slider track */}
        <div className="relative">
          {/* Range min/max labels - subtle, above the track */}
          {showOnlyEndLabels && (
            <div className="flex justify-between text-xs text-gray-400 mb-1 px-1">
              <span>{minVal}</span>
              <span>{maxVal}</span>
            </div>
          )}

          {/* Track container */}
          <div className="relative h-8">
            {/* Background track */}
            <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 bg-gray-300 rounded-full" />

            {/* Filled track from start to current value */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-500 rounded-full pointer-events-none"
              style={{
                left: 0,
                width: `${valuePercent}%`,
              }}
            />

            {/* Tick marks */}
            {options.map((opt, idx) => {
              const tickPercent = (idx / (options.length - 1)) * 100;
              return (
                <div
                  key={idx}
                  className={`absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-full pointer-events-none ${
                    idx <= currentIndex ? 'bg-blue-600' : 'bg-gray-400'
                  }`}
                  style={{ left: `calc(${tickPercent}% - 2px)` }}
                />
              );
            })}

            {/* Visual thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg pointer-events-none"
              style={{ left: `calc(${valuePercent}% - 10px)` }}
            />

            {/* Hidden range input */}
            <input
              type="range"
              min={0}
              max={options.length - 1}
              value={currentIndex}
              onChange={handleChange}
              className="absolute top-0 w-full h-full opacity-0 cursor-pointer"
              style={{ zIndex: 4 }}
            />
          </div>

          {/* Tick labels - only shown for small option sets */}
          {showTickLabels && (
            <div className="relative mt-1 h-4">
              {options.map((opt, idx) => {
                const tickPercent = (idx / (options.length - 1)) * 100;
                const isSelected = idx === currentIndex;
                return (
                  <span
                    key={idx}
                    className={`absolute text-xs transform -translate-x-1/2 ${
                      isSelected ? 'text-blue-600 font-medium' : 'text-gray-400'
                    }`}
                    style={{ left: `${tickPercent}%` }}
                  >
                    {opt}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SliderInput;
