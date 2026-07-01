import React from 'react';

/**
 * Segmented — design-system primitive for the sub-bar lens picker and any
 * other two-/three-state toggle that benefits from a pill-on-track look.
 *
 * Two tones (per the delivered B-1 design system notes in
 * `design/cofounder-mockups/`):
 *   - `light` (default) — white pill on a tinted gray track. Used by the
 *     `<SubBar>` `[Canvas | Lineage]` toggle.
 *   - `dark` — white pill on navy. Reserved for any future on-dark surface.
 *
 * Each option: `{ value, label, icon?, disabled?, title? }`. The selected
 * `value` is matched against `value` on the parent prop. `disabled` items
 * render muted and are non-interactive — used for the "lineage fallback"
 * pattern where Preview is disabled because the object type has no preview
 * component yet (per the n2 artboard).
 */
const Segmented = ({
  value,
  onChange,
  options = [],
  tone = 'light',
  size = 'sm',
  ariaLabel,
  testId,
}) => {
  const heightCls = size === 'sm' ? 'h-7' : 'h-8';
  const trackCls =
    tone === 'dark'
      ? 'bg-white/10 ring-white/15'
      : 'bg-gray-100 ring-gray-200';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
      className={`inline-flex ${heightCls} items-center gap-0.5 rounded-md p-0.5 ring-1 ${trackCls}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const isDisabled = !!opt.disabled;
        const baseActive =
          tone === 'dark'
            ? 'bg-white text-[#191d33] shadow-sm'
            : 'bg-white text-[#191d33] shadow-sm ring-1 ring-gray-200';
        const baseInactive =
          tone === 'dark'
            ? 'text-white/70 hover:text-white hover:bg-white/10'
            : 'text-gray-500 hover:text-gray-900 hover:bg-white/60';
        const baseDisabled = 'cursor-not-allowed text-gray-300';
        const cls = isDisabled ? baseDisabled : isActive ? baseActive : baseInactive;
        const Icon = opt.icon || null;
        return (
          <button
            type="button"
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            title={opt.title}
            onClick={() => !isDisabled && onChange && onChange(opt.value)}
            className={`inline-flex h-full items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors ${cls}`}
            data-testid={
              testId && opt.value ? `${testId}-option-${opt.value}` : undefined
            }
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default Segmented;
