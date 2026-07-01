import React, { useMemo } from 'react';
import ReactSelect, { components as RSComponents } from 'react-select';
import FieldPill from '../views/common/FieldPill';

/**
 * Select — the single, brand-skinned dropdown for the whole viewer.
 *
 * This is the ONLY place in the app that is allowed to import `react-select`
 * directly. Every native `<select>` has been replaced by this component, and a
 * guardrail (`scripts/check-no-native-select.sh`) keeps it that way. The seam is
 * deliberately narrow so the underlying library can be swapped later without
 * touching call sites.
 *
 * Why react-select (already installed, previously unused):
 *  - portal-capable (`menuPortalTarget`) so menus escape popovers / React-Flow /
 *    canvas overflow clipping — the literal "doesn't show up on screen shares"
 *    fix. Defaults to `document.body` + `menuPosition="fixed"`.
 *  - full ARIA combobox semantics, keyboard nav, and type-ahead out of the box.
 *
 * API (intentionally native-`<select>`-shaped, minus the event):
 *  - `value`        primitive value (or an array of values when `isMulti`).
 *  - `options`      `[{ value, label, type?, icon?, group?, isDisabled? }]`
 *                   OR pass `<option>` / `<optgroup>` children (compat shim).
 *  - `onChange(value)` receives the BARE value (or array for isMulti), NOT an
 *                   event. So `onChange={e => setX(e.target.value)}` becomes
 *                   `onChange={setX}`.
 *  - `placeholder`, `disabled`, `isMulti`, `isSearchable` (default false).
 *  - `size="sm"`    dense `text-[12px]` variant for canvas popovers.
 *  - `renderOption(opt)` custom option renderer; when an option carries a
 *                   `type`, the default renderer reuses <FieldPill> for the
 *                   type-colored rainbow (objectTypeConfigs) — never hand-rolled.
 *  - `data-testid`  applied to the react-select container so existing
 *                   `getByTestId(...)` selectors keep working; the open menu is
 *                   real queryable DOM (assert options with `react-select-event`).
 */

// Brand tokens (mirrors src/index.css @theme + FormSelect.jsx). Kept as CSS vars
// so they track the theme; literal fallbacks match the documented hex values.
const C = {
  border: 'var(--color-gray-300, #d1d5db)',
  borderFocus: 'var(--color-primary-500, #713b57)',
  ring: 'var(--color-primary-500, #713b57)',
  text: 'var(--color-gray-900, #111827)',
  placeholder: 'var(--color-gray-400, #9ca3af)',
  disabledBg: 'var(--color-gray-100, #f3f4f6)',
  disabledText: 'var(--color-gray-400, #9ca3af)',
  activeBg: 'var(--color-primary-100, #e2d7dd)',
  activeText: 'var(--color-primary-700, #432334)',
  hoverBg: '#f9f6f8',
};

const SIZE = {
  sm: { minHeight: 28, fontSize: 12, padX: 8, padY: 2 },
  md: { minHeight: 38, fontSize: 14, padX: 12, padY: 6 },
};

/** Parse `<option>` / `<optgroup>` children into a react-select options array. */
function childrenToOptions(children) {
  const out = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === 'optgroup') {
      out.push({
        label: child.props.label,
        options: childrenToOptions(child.props.children),
      });
    } else if (child.type === 'option') {
      const grandchildren = child.props.children;
      const label = typeof grandchildren === 'string' ? grandchildren : child.props.label;
      out.push({
        value: child.props.value,
        label: label ?? String(child.props.value ?? ''),
        isDisabled: !!child.props.disabled,
      });
    }
  });
  return out;
}

/** Flatten (possibly grouped) options to a flat list for value lookup. */
function flattenOptions(options) {
  const flat = [];
  (options || []).forEach(opt => {
    if (opt && Array.isArray(opt.options)) flat.push(...opt.options);
    else flat.push(opt);
  });
  return flat;
}

function buildStyles(sz) {
  return {
    container: base => ({ ...base, fontSize: sz.fontSize }),
    control: (base, state) => ({
      ...base,
      minHeight: sz.minHeight,
      backgroundColor: state.isDisabled ? C.disabledBg : 'white',
      borderColor: state.isFocused ? C.borderFocus : C.border,
      borderRadius: 6,
      boxShadow: state.isFocused ? `0 0 0 2px ${C.ring}` : 'none',
      cursor: state.isDisabled ? 'not-allowed' : 'pointer',
      transition: 'border-color 120ms ease, box-shadow 120ms ease',
      '&:hover': { borderColor: state.isFocused ? C.borderFocus : C.border },
    }),
    valueContainer: base => ({
      ...base,
      padding: `${sz.padY}px ${sz.padX}px`,
    }),
    input: base => ({ ...base, margin: 0, padding: 0, color: C.text }),
    singleValue: (base, state) => ({
      ...base,
      color: state.isDisabled ? C.disabledText : C.text,
    }),
    placeholder: base => ({ ...base, color: C.placeholder }),
    indicatorsContainer: base => ({ ...base, padding: 0 }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base, state) => ({
      ...base,
      padding: 4,
      color: state.isDisabled ? C.disabledText : 'var(--color-gray-400, #9ca3af)',
      '&:hover': { color: 'var(--color-gray-600, #4b5563)' },
    }),
    clearIndicator: base => ({ ...base, padding: 4 }),
    menu: base => ({
      ...base,
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid var(--color-gray-200, #e5e7eb)',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 4px 10px -5px rgba(0,0,0,0.1)',
      zIndex: 100,
    }),
    menuPortal: base => ({ ...base, zIndex: 9999 }),
    groupHeading: base => ({
      ...base,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: 'var(--color-gray-400, #9ca3af)',
    }),
    option: (base, state) => ({
      ...base,
      fontSize: sz.fontSize,
      cursor: state.isDisabled ? 'not-allowed' : 'pointer',
      color: state.isSelected ? C.activeText : C.text,
      backgroundColor: state.isSelected
        ? C.activeBg
        : state.isFocused
          ? C.hoverBg
          : 'white',
      '&:active': { backgroundColor: C.activeBg },
    }),
    multiValue: base => ({
      ...base,
      backgroundColor: C.activeBg,
      borderRadius: 9999,
    }),
    multiValueLabel: base => ({ ...base, color: C.activeText, fontSize: sz.fontSize }),
    multiValueRemove: base => ({
      ...base,
      color: C.activeText,
      borderRadius: 9999,
      '&:hover': { backgroundColor: 'var(--color-primary-200, #c6b0bb)', color: C.activeText },
    }),
  };
}

const Select = ({
  value,
  options,
  children,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  isMulti = false,
  isSearchable = false,
  isClearable = false,
  size = 'md',
  renderOption,
  className,
  id,
  name,
  'aria-label': ariaLabel,
  menuPortalTarget = typeof document !== 'undefined' ? document.body : undefined,
  menuPosition = 'fixed',
  'data-testid': dataTestId,
  ...rest
}) => {
  const resolvedOptions = useMemo(
    () => (options != null ? options : childrenToOptions(children)),
    [options, children]
  );
  const flatOptions = useMemo(() => flattenOptions(resolvedOptions), [resolvedOptions]);

  const selectedValue = useMemo(() => {
    if (isMulti) {
      const arr = Array.isArray(value) ? value : [];
      return arr
        .map(v => flatOptions.find(o => o && o.value === v) || { value: v, label: String(v) })
        .filter(Boolean);
    }
    if (value === undefined || value === null || value === '') {
      // Allow an explicit empty-string option (e.g. "(none)") to be selectable.
      const emptyMatch = flatOptions.find(o => o && o.value === value);
      return emptyMatch || null;
    }
    return flatOptions.find(o => o && o.value === value) || null;
  }, [value, flatOptions, isMulti]);

  const handleChange = selected => {
    if (!onChange) return;
    if (isMulti) {
      onChange((selected || []).map(o => o.value));
    } else {
      onChange(selected ? selected.value : null);
    }
  };

  const sz = SIZE[size] || SIZE.md;
  const styles = useMemo(() => buildStyles(sz), [sz]);

  // Default type-colored option/value rendering via FieldPill (objectTypeConfigs).
  const formatOptionLabel = (opt, meta) => {
    if (renderOption) return renderOption(opt, meta);
    if (opt && opt.type) {
      return <FieldPill type={opt.type} name={opt.label} className="!bg-transparent !border-0 !px-0" />;
    }
    return opt ? opt.label : '';
  };

  // Apply the data-testid to the react-select container so getByTestId works and
  // the (portaled) menu/options are queryable when open.
  const SelectContainer = props => (
    <RSComponents.SelectContainer {...props} innerProps={{ ...props.innerProps, 'data-testid': dataTestId }} />
  );

  return (
    <ReactSelect
      inputId={id}
      name={name}
      aria-label={ariaLabel}
      classNamePrefix="vis-select"
      className={className}
      value={selectedValue}
      options={resolvedOptions}
      onChange={handleChange}
      placeholder={placeholder}
      isDisabled={disabled}
      isMulti={isMulti}
      isSearchable={isSearchable}
      isClearable={isClearable}
      menuPortalTarget={menuPortalTarget}
      menuPosition={menuPosition}
      formatOptionLabel={formatOptionLabel}
      styles={styles}
      components={dataTestId ? { SelectContainer } : undefined}
      {...rest}
    />
  );
};

export default Select;
export { childrenToOptions };
