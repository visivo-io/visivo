import React from 'react';
import { HiDesktopComputer, HiMoon, HiSun } from 'react-icons/hi';
import { useDashboardThemeControls } from './DashboardThemeContext';

const OPTIONS = [
  { mode: 'light', label: 'Light theme', Icon: HiSun },
  { mode: 'dark', label: 'Dark theme', Icon: HiMoon },
  { mode: 'auto', label: 'Match system theme', Icon: HiDesktopComputer },
];

const ThemeModeToggle = ({ className = '' }) => {
  const controls = useDashboardThemeControls();
  if (!controls?.allowToggle) return null;
  const { selectedMode, setSelectedMode } = controls;

  return (
    <div
      role="radiogroup"
      aria-label="Dashboard theme"
      className={`inline-flex items-center gap-0.5 rounded-full border border-(--vt-border) bg-(--vt-surface) p-0.5 shadow-xs ${className}`}
    >
      {OPTIONS.map(({ mode, label, Icon }) => {
        const selected = selectedMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setSelectedMode(mode)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              selected
                ? 'bg-(--vt-accent) text-(--vt-surface)'
                : 'text-(--vt-muted) hover:text-(--vt-text)'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
};

export default ThemeModeToggle;
