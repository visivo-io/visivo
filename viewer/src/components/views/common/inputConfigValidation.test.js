import { validateInputDraft, buildInputConfig } from './inputConfigValidation';
import { validateName } from './namedModel';

describe('validateInputDraft (VIS-898)', () => {
  const base = {
    name: 'my_input',
    inputType: 'single-select',
    optionsMode: 'list',
    options: ['a', 'b', 'c'],
    optionsQuery: '',
    rangeStart: '',
    rangeEnd: '',
    rangeStep: '',
    displayType: 'dropdown',
    defaultValue: '',
  };

  it('passes a valid single-select list draft', () => {
    expect(validateInputDraft(base, validateName)).toEqual({});
  });

  it('flags an invalid name', () => {
    const errors = validateInputDraft({ ...base, name: '' }, validateName);
    expect(errors.name).toBeTruthy();
  });

  it('flags an empty options list', () => {
    const errors = validateInputDraft({ ...base, options: [] }, validateName);
    expect(errors.options).toMatch(/at least one option/i);
  });

  it('flags a single-select default that is not in the options list', () => {
    const errors = validateInputDraft({ ...base, defaultValue: 'zzz' }, validateName);
    expect(errors.defaultValue).toMatch(/not in the options/i);
  });

  it('accepts a single-select default that IS in the options list', () => {
    const errors = validateInputDraft({ ...base, defaultValue: 'b' }, validateName);
    expect(errors.defaultValue).toBeUndefined();
  });

  it('flags multi-select defaults not in the options list', () => {
    const errors = validateInputDraft(
      { ...base, inputType: 'multi-select', defaultValue: 'a, zzz' },
      validateName
    );
    expect(errors.defaultValue).toMatch(/zzz/);
  });

  it('does NOT flag default containment for query options (unknown set)', () => {
    const errors = validateInputDraft(
      { ...base, optionsMode: 'query', optionsQuery: '?{ select x from t }', defaultValue: 'anything' },
      validateName
    );
    expect(errors.defaultValue).toBeUndefined();
  });

  it('requires a query in query mode', () => {
    const errors = validateInputDraft(
      { ...base, optionsMode: 'query', optionsQuery: '   ' },
      validateName
    );
    expect(errors.optionsQuery).toBeTruthy();
  });

  it('requires range fields in range mode', () => {
    const errors = validateInputDraft(
      { ...base, inputType: 'multi-select', optionsMode: 'range' },
      validateName
    );
    expect(errors.rangeStart).toBeTruthy();
    expect(errors.rangeEnd).toBeTruthy();
    expect(errors.rangeStep).toBeTruthy();
  });

  it('requires exactly 2 options for a single-select toggle display', () => {
    const errors = validateInputDraft({ ...base, displayType: 'toggle' }, validateName);
    expect(errors.options).toMatch(/exactly 2/i);
  });
});

describe('buildInputConfig (VIS-898)', () => {
  it('builds a single-select list config with default', () => {
    const config = buildInputConfig({
      name: 'region',
      inputType: 'single-select',
      label: 'Region',
      optionsMode: 'list',
      options: ['East', 'West'],
      displayType: 'dropdown',
      defaultValue: 'East',
    });
    expect(config).toEqual({
      name: 'region',
      type: 'single-select',
      label: 'Region',
      options: ['East', 'West'],
      display: { default: { value: 'East' } },
    });
  });

  it('coerces numeric-looking defaults and includes a non-dropdown display type', () => {
    const config = buildInputConfig({
      name: 'threshold',
      inputType: 'single-select',
      optionsMode: 'list',
      options: ['3', '5', '7'],
      displayType: 'radio',
      defaultValue: '5',
    });
    expect(config.display.type).toBe('radio');
    expect(config.display.default).toEqual({ value: 5 });
  });

  it('builds a multi-select range config', () => {
    const config = buildInputConfig({
      name: 'price',
      inputType: 'multi-select',
      optionsMode: 'range',
      rangeStart: '0',
      rangeEnd: '1000',
      rangeStep: '50',
      displayType: 'range-slider',
    });
    expect(config.range).toEqual({ start: 0, end: 1000, step: 50 });
    expect(config.options).toBeUndefined();
  });

  it('builds a query-options config', () => {
    const config = buildInputConfig({
      name: 'q',
      inputType: 'single-select',
      optionsMode: 'query',
      optionsQuery: '?{ select x from t }',
      displayType: 'dropdown',
    });
    expect(config.options).toBe('?{ select x from t }');
  });

  it('builds multi-select default values as a list', () => {
    const config = buildInputConfig({
      name: 'cats',
      inputType: 'multi-select',
      optionsMode: 'list',
      options: ['A', 'B', 'C'],
      displayType: 'dropdown',
      defaultValue: 'A, B',
    });
    expect(config.display.default).toEqual({ values: ['A', 'B'] });
  });
});
