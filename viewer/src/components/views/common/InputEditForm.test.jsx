/**
 * InputEditForm tests (VIS-898 / Track G — input slice).
 *
 * Covers the two modes:
 *  - autoSave (right rail): edits debounce-persist through onSave with NO Save
 *    button; status is reported via onSaveStatusChange; inline validation is
 *    non-blocking and skips the round-trip for obvious errors.
 *  - legacy modal: keeps the explicit Save button.
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import InputEditForm from './InputEditForm';
import useStore from '../../../stores/store';

const seed = (overrides = {}) => {
  act(() => {
    useStore.setState({
      deleteInput: jest.fn(async () => ({ success: true })),
      checkCommitStatus: jest.fn(async () => {}),
      ...overrides,
    });
  });
};

const makeInput = (configOverrides = {}) => ({
  name: 'split_threshold',
  status: 'PUBLISHED',
  config: {
    name: 'split_threshold',
    type: 'single-select',
    label: 'Split Threshold',
    options: ['3', '5', '7'],
    display: { type: 'dropdown', default: { value: '5' } },
    ...configOverrides,
  },
});

describe('InputEditForm — autoSave mode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    seed();
  });
  afterEach(() => {
    if (jest.isMockFunction(setTimeout)) {
      act(() => jest.runOnlyPendingTimers());
    }
    jest.useRealTimers();
  });

  test('renders WITHOUT a Save button in autoSave mode', () => {
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} autoSave />);
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    // Fields are seeded from the input config.
    expect(screen.getByLabelText('Label')).toHaveValue('Split Threshold');
  });

  test('editing a field debounce-persists through onSave (no Save button)', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} autoSave />);

    // Allow hydration (setTimeout(...,0)) to complete.
    act(() => jest.advanceTimersByTime(1));

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'New Label' } });

    // No save before the debounce window elapses.
    expect(onSave).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(500));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, name, config] = onSave.mock.calls[0];
    expect(type).toBe('input');
    expect(name).toBe('split_threshold');
    expect(config.label).toBe('New Label');
    expect(config.options).toEqual(['3', '5', '7']);
  });

  test('reports save status to onSaveStatusChange', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    const onSaveStatusChange = jest.fn();
    render(
      <InputEditForm
        input={makeInput()}
        onSave={onSave}
        onSaveStatusChange={onSaveStatusChange}
        autoSave
      />
    );
    act(() => jest.advanceTimersByTime(1));
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Z' } });
    act(() => jest.advanceTimersByTime(500));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // 'pending' is fired on schedule, then 'saving'/'saved' as it resolves.
    expect(onSaveStatusChange).toHaveBeenCalledWith('pending');
  });

  test('inline validation: invalid default is shown and is NOT round-tripped', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} autoSave />);
    act(() => jest.advanceTimersByTime(1));

    fireEvent.change(screen.getByLabelText('Default Value'), { target: { value: 'not_an_option' } });
    act(() => jest.advanceTimersByTime(500));

    // Error shown inline near the field; form stays editable; no save attempted.
    expect(screen.getByText(/not in the options/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    // The field is still editable (not disabled).
    expect(screen.getByLabelText('Default Value')).not.toBeDisabled();
  });

  test('surfaces a backend rejection inline without trapping the user', async () => {
    // Real timers so the async save promise + the on-error re-fetch settle.
    jest.useRealTimers();
    const onSave = jest.fn(async () => ({ success: false, error: 'default value not in options' }));
    render(<InputEditForm input={makeInput()} onSave={onSave} autoSave />);

    // Let the 0ms hydration guard settle so field edits schedule a save.
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Backend Boom' } });

    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 2000 });
    expect(await screen.findByText(/default value not in options/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).not.toBeDisabled();
  });
});

describe('InputEditForm — legacy modal mode', () => {
  beforeEach(() => seed());

  test('renders a Save button and persists on click', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Legacy' } });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].label).toBe('Legacy');
  });

  test('blocks save on invalid default and shows inline error', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Default Value'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/not in the options/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('InputEditForm — switching a range multi-select to single-select', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    seed();
  });
  afterEach(() => {
    if (jest.isMockFunction(setTimeout)) {
      act(() => jest.runOnlyPendingTimers());
    }
    jest.useRealTimers();
  });

  const rangeInput = {
    name: 'price_range',
    status: 'PUBLISHED',
    config: {
      name: 'price_range',
      type: 'multi-select',
      range: { start: 0, end: 100, step: 10 },
      display: { type: 'range-slider' },
    },
  };

  test('never auto-saves a single-select config carrying `range`, and exits range mode', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={rangeInput} onSave={onSave} autoSave />);

    // Allow hydration (setTimeout(...,0)) to complete; range fields present.
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByLabelText('Start')).toHaveValue('0');

    // Drive the (portaled) brand Select synchronously — selectEvent's async
    // waits don't advance fake timers here.
    const typeInput = screen.getByLabelText('Type');
    fireEvent.focus(typeInput);
    fireEvent.keyDown(typeInput, { key: 'ArrowDown', keyCode: 40 });
    fireEvent.click(screen.getByText('Single Select'));

    // Flush past the auto-save debounce window.
    act(() => jest.advanceTimersByTime(600));

    // `range` is multi-select only (SingleSelectInput has no range field and
    // requires options) — no save may round-trip it on a single-select.
    const badCalls = onSave.mock.calls.filter(
      ([, , config]) => config.type === 'single-select' && config.range
    );
    expect(badCalls).toHaveLength(0);

    // The stranded 'range' mode exits to the static list editor instead of
    // lingering with no toggle selected.
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
    expect(screen.getByText('No options added')).toBeInTheDocument();
  });
});
