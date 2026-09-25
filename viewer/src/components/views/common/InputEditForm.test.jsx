/**
 * InputEditForm tests (VIS-898 / Track G — input slice).
 *
 * The Input editor is a standard leaf edit panel: edits are held locally and
 * persisted only on an explicit Save through the shared Delete · Discard · Save
 * footer. Save is gated on real edits, Discard reverts to the last-saved values,
 * and inline validation is non-blocking (shown near the field, blocks the save).
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

// Let the 0ms hydration guard settle so post-hydration validation/reset effects run.
const flushHydration = async () => {
  await act(async () => {
    await new Promise(r => setTimeout(r, 0));
  });
};

describe('InputEditForm — footer + save gating', () => {
  beforeEach(() => seed());

  test('renders the Delete · Discard · Save footer in edit mode', () => {
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('form-footer-save')).toHaveTextContent('Save');
    expect(screen.getByTestId('form-footer-cancel')).toHaveTextContent('Discard');
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
    // Fields are seeded from the input config.
    expect(screen.getByLabelText('Label')).toHaveValue('Split Threshold');
  });

  test('Save is disabled until an edit is made, then persists through onSave', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);

    const saveBtn = screen.getByTestId('form-footer-save');
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'New Label' } });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, name, config] = onSave.mock.calls[0];
    expect(type).toBe('input');
    expect(name).toBe('split_threshold');
    expect(config.label).toBe('New Label');
    expect(config.options).toEqual(['3', '5', '7']);
  });

  test('Discard reverts an edit to the last-saved value', () => {
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);
    const labelField = screen.getByLabelText('Label');
    expect(labelField).toHaveValue('Split Threshold');

    fireEvent.change(labelField, { target: { value: 'Changed' } });
    expect(labelField).toHaveValue('Changed');
    // Discard is enabled once dirty, and reverts to the baseline.
    fireEvent.click(screen.getByTestId('form-footer-cancel'));
    expect(screen.getByLabelText('Label')).toHaveValue('Split Threshold');
  });

  test('a failed save surfaces the backend error', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'input rejected upstream' }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('form-footer-save'));

    expect(await screen.findByText('input rejected upstream')).toBeInTheDocument();
    // Save recovered to its idle label so the user can retry.
    expect(screen.getByTestId('form-footer-save')).toHaveTextContent('Save');
  });

  test('an invalid default is shown inline and blocks the save', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Default Value'), { target: { value: 'not_an_option' } });
    fireEvent.click(screen.getByTestId('form-footer-save'));

    // Error shown inline near the field; form stays editable; no save attempted.
    expect(await screen.findByText(/not in the options/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Default Value')).not.toBeDisabled();
  });
});

/**
 * The user journey this exists for: "if I make changes to an object, then click
 * away, then click back it discards all the changes." The right rail is a
 * SINGLE instance bound to the active object, so clicking away really does
 * unmount the form — unmount/remount here is that round trip.
 */
describe('InputEditForm — unsaved edits survive clicking away and back', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seed();
  });
  afterEach(() => window.localStorage.clear());

  const renderForm = () =>
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);

  it('restores the in-progress edit when the object is re-opened', () => {
    const view = renderForm();
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Half-typed edit' } });
    view.unmount(); // click away

    renderForm(); // click back
    expect(screen.getByLabelText('Label')).toHaveValue('Half-typed edit');
    // Still reported as unsaved, against the values that were actually saved.
    expect(screen.getByTestId('form-footer-save')).not.toBeDisabled();
    expect(screen.getByTestId('form-footer-cancel')).not.toBeDisabled();
  });

  it('Discard after returning reverts to the saved values, and they stay reverted', () => {
    const view = renderForm();
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Half-typed edit' } });
    view.unmount();

    const { unmount: leaveAgain } = renderForm();
    fireEvent.click(screen.getByTestId('form-footer-cancel')); // Discard
    expect(screen.getByLabelText('Label')).toHaveValue('Split Threshold');
    leaveAgain();

    renderForm();
    expect(screen.getByLabelText('Label')).toHaveValue('Split Threshold');
    expect(screen.getByTestId('form-footer-save')).toBeDisabled();
  });

  it('a saved edit leaves no draft behind', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    const view = render(
      <InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />
    );
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Saved Label' } });
    fireEvent.click(screen.getByTestId('form-footer-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    // The rail re-seeds the form from the saved record; nothing is left over.
    const savedInput = makeInput({ label: 'Saved Label' });
    view.rerender(<InputEditForm input={savedInput} onSave={onSave} onClose={jest.fn()} />);
    view.unmount();

    render(<InputEditForm input={savedInput} onSave={onSave} onClose={jest.fn()} />);
    expect(screen.getByLabelText('Label')).toHaveValue('Saved Label');
    expect(screen.getByTestId('form-footer-save')).toBeDisabled();
  });

  it('edits are kept per object — two inputs do not bleed into each other', () => {
    const other = {
      name: 'other_input',
      status: 'PUBLISHED',
      config: { name: 'other_input', type: 'single-select', label: 'Other', options: ['a'] },
    };

    const view = renderForm();
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Edit on A' } });
    view.unmount();

    // Open a DIFFERENT input: it must be untouched by A's draft.
    const { unmount: leaveOther } = render(
      <InputEditForm input={other} onSave={jest.fn()} onClose={jest.fn()} />
    );
    expect(screen.getByLabelText('Label')).toHaveValue('Other');
    leaveOther();

    // …and A's edit is still waiting.
    renderForm();
    expect(screen.getByLabelText('Label')).toHaveValue('Edit on A');
  });

  it('a corrupt stored draft is dropped and the saved values render', () => {
    // Failure rule, end to end: a bad entry never surfaces as a broken form.
    window.localStorage.setItem('visivo.draft.local.input:split_threshold', 'not json at all');
    renderForm();
    expect(screen.getByLabelText('Label')).toHaveValue('Split Threshold');
    expect(screen.getByTestId('form-footer-save')).toBeDisabled();
    expect(window.localStorage.getItem('visivo.draft.local.input:split_threshold')).toBeNull();
  });
});

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

describe('InputEditForm — static list editing', () => {
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

    fireEvent.click(screen.getByTestId('form-footer-save'));
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

    fireEvent.click(screen.getByTestId('form-footer-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, name, config] = onSave.mock.calls[0];
    expect(type).toBe('input');
    expect(name).toBe('region_filter');
    expect(config).toEqual({ name: 'region_filter', type: 'single-select', options: ['east'] });
  });
});

describe('InputEditForm — options mode switching, query & range editing', () => {
  beforeEach(() => seed());

  test('switching to query mode requires a query, then serializes the edited query', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<InputEditForm input={makeInput()} onSave={onSave} onClose={jest.fn()} />);
    await flushHydration();

    fireEvent.click(screen.getByLabelText('query string'));
    expect(await screen.findByText('Query is required')).toBeInTheDocument();

    // The editor holds the query BODY — the `?{ }` wrapper the backend's
    // QueryString type requires is applied on save, not typed by hand.
    const editor = screen.getByTestId('ref-textarea-editable');
    editor.textContent = 'SELECT DISTINCT region FROM orders';
    fireEvent.input(editor);
    await waitFor(() => expect(screen.queryByText('Query is required')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('form-footer-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].options).toBe('?{SELECT DISTINCT region FROM orders}');
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

    fireEvent.click(screen.getByTestId('form-footer-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].range).toEqual({ start: 5, end: 50, step: 5 });
  });

  test('switching a range multi-select to single-select exits range mode', async () => {
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
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );

    // Hydration must complete before the display-reset effect will fire.
    await flushHydration();
    expect(screen.getByLabelText('Start')).toHaveValue('0');

    // Drive the (portaled) brand Select synchronously.
    const typeInput = screen.getByLabelText('Type');
    fireEvent.focus(typeInput);
    fireEvent.keyDown(typeInput, { key: 'ArrowDown', keyCode: 40 });
    fireEvent.click(screen.getByText('Single Select'));

    // The stranded 'range' mode exits to the static list editor instead of
    // lingering with no toggle selected.
    expect(screen.queryByLabelText('Start')).not.toBeInTheDocument();
    expect(screen.getByText('No options added')).toBeInTheDocument();
  });
});

describe('InputEditForm — delete flows', () => {
  test('confirm delete removes the input and refreshes commit status', async () => {
    const deleteInput = jest.fn(async () => ({ success: true }));
    const checkCommitStatus = jest.fn(async () => {});
    seed({ deleteInput, checkCommitStatus });
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete'));
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

    fireEvent.click(screen.getByTitle('Delete'));
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

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('Confirm Delete'));

    expect(await screen.findByText('gateway timeout')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
  });

  test('cancel dismisses the confirmation without deleting', () => {
    const deleteInput = jest.fn();
    seed({ deleteInput });
    render(<InputEditForm input={makeInput()} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();
    // The confirm box's Cancel (the footer button reads "Discard" in edit mode).
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/mark it for deletion/i)).not.toBeInTheDocument();
    expect(deleteInput).not.toHaveBeenCalled();
    // The delete affordance returns once the confirm is dismissed.
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  test('a NEW input warns about discarding unsaved changes', () => {
    seed();
    render(<InputEditForm input={{ ...makeInput(), status: 'new' }} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/discard your unsaved changes/i)).toBeInTheDocument();
  });
});
