import React from 'react';
import Select from '../../common/Select';
import { CHART_TYPES } from '../../../schemas/schemas';

/**
 * TypeSelector (VIS-1020)
 *
 * The chart/trace-type dropdown for an Insight's Plotly props. A thin, controlled
 * wrapper over the on-brand `common/Select.jsx`, populated from the shared
 * `CHART_TYPES` registry (the single source of truth shared with `schemas.js`).
 *
 * It is intentionally dumb: on change it just calls `onChange(newType)`. The
 * parent/editor (TracePropsEditor) owns running `preserveTraceProps` and any
 * schema loading — this component never mutates props itself.
 *
 * @param {object} props
 * @param {string} props.value - the currently selected chart type (e.g. 'scatter')
 * @param {(newType: string) => void} props.onChange - bare-value change handler
 * @param {boolean} [props.disabled]
 * @param {string} [props.id]
 * @param {string} [props['aria-label']]
 * @param {string} [props['data-testid']]
 */
const TypeSelector = ({
  value,
  onChange,
  disabled = false,
  id,
  'aria-label': ariaLabel = 'Chart type',
  'data-testid': dataTestId = 'type-selector',
}) => {
  const options = React.useMemo(
    () =>
      CHART_TYPES
        // `layout` is a Plotly schema container, not a selectable trace type.
        .filter(t => t.value !== 'layout')
        .map(t => ({ value: t.value, label: t.label })),
    []
  );

  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      value={value}
      options={options}
      onChange={newType => {
        if (onChange) onChange(newType);
      }}
      disabled={disabled}
      isSearchable
      placeholder="Select chart type…"
    />
  );
};

export default TypeSelector;
