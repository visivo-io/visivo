/**
 * Client-side, non-blocking validation for Input edit forms (VIS-898 / Track G).
 *
 * The right-rail Input form auto-saves on a debounce with no Save button, so the
 * backend (Pydantic + the project JSON schema) remains the source of truth for
 * validity. To avoid round-tripping obviously-broken configs and to give the
 * user inline feedback *before* the POST, we validate the most common authoring
 * mistakes here. These checks mirror the `SingleSelectInput` / `MultiSelectInput`
 * shapes in the project JSON schema (e.g. "default value not in options").
 *
 * Validation is intentionally LENIENT: it only flags errors we are confident
 * about. Anything subtle is left to the backend, whose message is surfaced
 * inline by the form. The form stays editable regardless.
 *
 * @param {object} draft - the in-progress form values
 * @param {string}  draft.name
 * @param {('single-select'|'multi-select')} draft.inputType
 * @param {('list'|'query'|'range')} draft.optionsMode
 * @param {string[]} draft.options       - list-mode options
 * @param {string}   draft.optionsQuery  - query-mode options string
 * @param {string}   draft.rangeStart
 * @param {string}   draft.rangeEnd
 * @param {string}   draft.rangeStep
 * @param {string}   draft.displayType
 * @param {string}   draft.defaultValue  - single: scalar; multi: comma-separated
 * @param {(name:string)=>string|null} validateNameFn - shared name validator
 * @returns {{ [field:string]: string }} map of field → error message (empty = valid)
 */
export function validateInputDraft(draft, validateNameFn) {
  const {
    name = '',
    inputType = 'single-select',
    optionsMode = 'list',
    options = [],
    optionsQuery = '',
    rangeStart = '',
    rangeEnd = '',
    rangeStep = '',
    displayType = 'dropdown',
    defaultValue = '',
  } = draft || {};

  const errors = {};

  const nameError = validateNameFn ? validateNameFn(name) : null;
  if (nameError) errors.name = nameError;

  if (optionsMode === 'range') {
    if (rangeStart === '' || rangeStart == null) errors.rangeStart = 'Start is required';
    if (rangeEnd === '' || rangeEnd == null) errors.rangeEnd = 'End is required';
    if (rangeStep === '' || rangeStep == null) errors.rangeStep = 'Step is required';
  } else if (optionsMode === 'query') {
    if (!optionsQuery.trim()) errors.optionsQuery = 'Query is required';
  } else {
    if (!options || options.length === 0) {
      errors.options = 'At least one option is required';
    }
    if (inputType === 'single-select' && displayType === 'toggle' && options.length !== 2) {
      errors.options = 'Toggle display requires exactly 2 options';
    }
  }

  // Default-value containment — only checkable against a static list. For query
  // or range options the valid set is unknown client-side, so defer to backend.
  if (optionsMode === 'list' && defaultValue.trim() && !errors.options) {
    if (inputType === 'single-select') {
      if (!options.includes(defaultValue.trim())) {
        errors.defaultValue = `Default value "${defaultValue.trim()}" is not in the options list`;
      }
    } else {
      const vals = defaultValue
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      const missing = vals.filter(v => !options.includes(v));
      if (missing.length > 0) {
        errors.defaultValue =
          missing.length === 1
            ? `Default value "${missing[0]}" is not in the options list`
            : `Default values ${missing.map(v => `"${v}"`).join(', ')} are not in the options list`;
      }
    }
  }

  return errors;
}

/**
 * Build the persisted input config from the form draft. Mirrors the shape the
 * backend Input manager + project JSON schema expect (single/multi select with
 * list / query / range options and a display block).
 */
export function buildInputConfig(draft) {
  const {
    name = '',
    inputType = 'single-select',
    label = '',
    optionsMode = 'list',
    options = [],
    optionsQuery = '',
    rangeStart = '',
    rangeEnd = '',
    rangeStep = '',
    displayType = 'dropdown',
    defaultValue = '',
  } = draft || {};

  const config = { name, type: inputType };

  if (label.trim()) config.label = label.trim();

  const toNumberOrString = v => (v !== '' && !isNaN(Number(v)) ? Number(v) : v);

  if (optionsMode === 'range') {
    config.range = {
      start: toNumberOrString(rangeStart),
      end: toNumberOrString(rangeEnd),
      step: toNumberOrString(rangeStep),
    };
  } else if (optionsMode === 'query') {
    config.options = optionsQuery.trim();
  } else {
    config.options = options;
  }

  if (displayType !== 'dropdown') {
    config.display = { type: displayType };
  }

  if (defaultValue.trim()) {
    if (!config.display) config.display = {};
    if (inputType === 'single-select') {
      config.display.default = { value: toNumberOrString(defaultValue.trim()) };
    } else {
      const vals = defaultValue
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      if (vals.length > 0) {
        config.display.default = { values: vals.map(toNumberOrString) };
      }
    }
  }

  return config;
}
