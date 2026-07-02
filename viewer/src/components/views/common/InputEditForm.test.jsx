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

// Let the 0ms hydration guard settle so post-hydration validation/edit effects run.
const flushHydration = async () => {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
};

describe('InputEditForm — hydration variants', () => {
  beforeEach(() => seed());

  test('hydrates query-string options into the query editor', () => {
    render(
      <InputEditForm
        input={makeInput({ options: '?{ SELECT region FROM orders }' })}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByTestId('ref-textarea-editable')).toHaveTextContent(
      'SELECT region FROM orders'
    );
    // The static list editor is not shown in query mode.
    expect(screen.queryByPlaceholderText('Add option...')).not.toBeInTheDocument();
  });

  test('hydrates multi-select array defaults as comma-joined values', () => {
    render(
      <InputEditForm
        input={makeInput({
          type: 'multi-select',
          options: ['a', 'b', 'c'],
          display: { type: 'dropdown', default: { values: ['a', 'b'] } },
        })}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Default Values')).toHaveValue('a, b');
  });

  test('hydrates a string multi-select default verbatim', () => {
    render(
      <InputEditForm
        input={makeInput({
          type: 'multi-select',
          options: ['a', 'b'],
          display: { type: 'dropdown', default: { values: 'a' } },
        })}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Default Values')).toHaveValue('a');
  });
});

describe('InputEditForm — static list editing (legacy mode)', () => {
  beforeEach(() => seed());

  test('adds options via the Add button and Enter, ignoring duplicates', () => {
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);
    const optionInput = screen.getByPlaceholderText('Add option...');

    fireEvent.change(optionInput, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(optionInput).toHaveValue('');

    fireEvent.change(optionInput, { target: { value: '11' } });
    fireEvent.keyDown(optionInput, { key: 'Enter' });
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(optionInput).toHaveValue('');

    // Duplicates are ignored and the draft text stays put for correction.
    fireEvent.change(optionInput, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByText('9')).toHaveLength(1);
    expect(optionInput).toHaveValue('9');
  });

  test('removing an option updates the list and the saved config', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <InputEditForm
        input={makeInput({ display: { type: 'dropdown' } })}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    // Option remove buttons are the only unnamed (icon-only) buttons; they
    // render in option order, so index 1 removes '5'.
    const removeButtons = screen.getAllByRole('button', { name: accName => accName === '' });
    expect(removeButtons).toHaveLength(3);
    fireEvent.click(removeButtons[1]);
    expect(screen.queryByText('5')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].options).toEqual(['3', '7']);
  });

  test('create mode: the typed name is used for the save call', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={null} isCreate onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'region_filter' } });
    const optionInput = screen.getByPlaceholderText('Add option...');
    fireEvent.change(optionInput, { target: { value: 'east' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, name, config] = onSave.mock.calls[0];
    expect(type).toBe('input');
    expect(name).toBe('region_filter');
    expect(config).toEqual({ name: 'region_filter', type: 'single-select', options: ['east'] });
  });

  test('a failed legacy save surfaces the backend error', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'input rejected upstream' }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText('input rejected upstream')).toBeInTheDocument();
    // Save recovered to its idle label so the user can retry.
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });
});

describe('InputEditForm — options mode switching, query & range editing (legacy mode)', () => {
  beforeEach(() => seed());

  test('switching to query mode requires a query, then serializes the edited query', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);
    await flushHydration();

    fireEvent.click(screen.getByLabelText('query string'));
    expect(await screen.findByText('Query is required')).toBeInTheDocument();

    const editor = screen.getByTestId('ref-textarea-editable');
    editor.textContent = '?{ SELECT DISTINCT region FROM orders }';
    fireEvent.input(editor);
    await waitFor(() => expect(screen.queryByText('Query is required')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].options).toBe('?{ SELECT DISTINCT region FROM orders }');
  });

  test('range editing validates required fields and serializes numbers', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <InputEditForm
        input={{
          name: 'price_range',
          status: 'PUBLISHED',
          config: {
            name: 'price_range',
            type: 'multi-select',
            range: { start: 0, end: 100, step: 10 },
            display: { type: 'range-slider' },
          },
        }}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );
    await flushHydration();

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '' } });
    expect(await screen.findByText('Start is required')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '5' } });
    await waitFor(() => expect(screen.queryByText('Start is required')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].range).toEqual({ start: 5, end: 50, step: 5 });
  });
});

describe('InputEditForm — delete flows', () => {
  test('confirm delete removes the input and refreshes commit status', async () => {
    const deleteInput = jest.fn(async () => ({ success: true }));
    const checkCommitStatus = jest.fn(async () => {});
    seed({ deleteInput, checkCommitStatus });
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete input'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Confirm Delete'));

    await waitFor(() => expect(deleteInput).toHaveBeenCalledWith('split_threshold'));
    await waitFor(() => expect(checkCommitStatus).toHaveBeenCalled());
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
  });

  test('a failed delete surfaces the error and dismisses the confirm', async () => {
    seed({
      deleteInput: jest.fn(async () => ({ success: false, error: 'input is referenced by a dashboard' })),
    });
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete input'));
    fireEvent.click(screen.getByText('Confirm Delete'));

    expect(await screen.findByText('input is referenced by a dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
  });

  test('a thrown delete error surfaces its message', async () => {
    seed({
      deleteInput: jest.fn(async () => {
        throw new Error('gateway timeout');
      }),
    });
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete input'));
    fireEvent.click(screen.getByText('Confirm Delete'));

    expect(await screen.findByText('gateway timeout')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
  });

  test('cancel dismisses the confirmation without deleting', () => {
    const deleteInput = jest.fn();
    seed({ deleteInput });
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete input'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();
    // The confirm box renders above the footer, so its Cancel comes first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(screen.queryByText(/mark it for deletion/i)).not.toBeInTheDocument();
    expect(deleteInput).not.toHaveBeenCalled();
    // The delete affordance returns once the confirm is dismissed.
    expect(screen.getByTitle('Delete input')).toBeInTheDocument();
  });

  test('autoSave mode: a NEW input warns about discarding unsaved changes', () => {
    seed();
    render(<InputEditForm input={{ ...makeInput(), status: 'new' }} onSave={jest.fn()} autoSave />);

    fireEvent.click(screen.getByTitle('Delete input'));
    expect(screen.getByText(/discard your unsaved changes/i)).toBeInTheDocument();
  });
});
