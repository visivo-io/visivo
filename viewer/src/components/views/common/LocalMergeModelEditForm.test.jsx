/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocalMergeModelEditForm from './LocalMergeModelEditForm';

// Selector-aware store mock (form pulls actions via useStore(state => state.x)).
const mockState = {
  deleteLocalMergeModel: jest.fn(),
  checkCommitStatus: jest.fn(),
};
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'new', MODIFIED: 'modified', PUBLISHED: 'published', DELETED: 'deleted' },
  default: selector => (typeof selector === 'function' ? selector(mockState) : mockState),
}));

jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea aria-label="code" value={value || ''} onChange={e => onChange?.(e.target.value)} />
  ),
}));

// Functional RefSelector stub — one input per model-ref row.
jest.mock('./RefSelector', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <input
      data-testid="ref-selector"
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
    />
  ),
}));

const setName = value =>
  fireEvent.change(screen.getByLabelText('Name'), { target: { value } });
const setSql = value =>
  fireEvent.change(screen.getByLabelText('code'), { target: { value } });
const setRef = (index, value) =>
  fireEvent.change(screen.getAllByTestId('ref-selector')[index], { target: { value } });
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

const editModel = () => ({
  name: 'merged_orders',
  status: 'published',
  config: {
    name: 'merged_orders',
    sql: 'select * from m',
    models: ['${ref(orders)}', ' ref(items) ', '  ', 'plain_model'],
  },
});

const renderCreate = (props = {}) =>
  render(<LocalMergeModelEditForm isCreate onSave={jest.fn()} onClose={jest.fn()} {...props} />);

const renderEdit = (props = {}) =>
  render(
    <LocalMergeModelEditForm
      model={editModel()}
      isCreate={false}
      onSave={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockState.deleteLocalMergeModel.mockResolvedValue({ success: true });
  mockState.checkCommitStatus.mockResolvedValue({ success: true });
});

describe('LocalMergeModelEditForm — create mode', () => {
  it('disables Save until name, sql, and at least one model ref are set', () => {
    renderCreate();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    setName('merged');
    setSql('select 1');
    expect(save).toBeDisabled(); // still no model ref

    setRef(0, 'ref(orders)');
    expect(save).toBeEnabled();
  });

  it('starts with a single empty ref row and no remove buttons', () => {
    renderCreate();
    expect(screen.getAllByTestId('ref-selector')).toHaveLength(1);
    expect(screen.getAllByTestId('ref-selector')[0]).toHaveValue('');
    expect(screen.queryByTestId('RemoveIcon')).not.toBeInTheDocument();
  });

  it('parses ref-formatted values and saves a trimmed config', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderCreate({ onSave });
    setName('  merged  ');
    setSql('  select 1  ');
    setRef(0, 'ref(model_a)');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    setRef(1, '${ref(model_b)}');

    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('localMergeModel', 'merged', {
      name: 'merged',
      sql: 'select 1',
      models: ['model_a', 'model_b'],
    });
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('drops blank ref rows from the saved models list', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderCreate({ onSave });
    setName('merged');
    setSql('select 1');
    setRef(0, 'orders');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    // Row 1 left blank on purpose.

    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].models).toEqual(['orders']);
  });

  it('adds and removes ref rows, keeping the surviving value', () => {
    renderCreate();
    setRef(0, 'first');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    setRef(1, 'second');
    expect(screen.getAllByTestId('ref-selector')).toHaveLength(2);

    // Remove buttons only appear once there are multiple rows.
    const removeIcons = screen.getAllByTestId('RemoveIcon');
    expect(removeIcons).toHaveLength(2);
    fireEvent.click(removeIcons[0]);

    const remaining = screen.getAllByTestId('ref-selector');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveValue('second');
    expect(screen.queryByTestId('RemoveIcon')).not.toBeInTheDocument();
  });

  it('surfaces the error returned by a failed save', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'merge failed' }));
    renderCreate({ onSave });
    setName('merged');
    setSql('select 1');
    setRef(0, 'orders');
    clickSave();
    expect(await screen.findByText('merge failed')).toBeInTheDocument();
  });

  it('falls back to a generic message when save resolves with nothing', async () => {
    const onSave = jest.fn(async () => undefined);
    renderCreate({ onSave });
    setName('merged');
    setSql('select 1');
    setRef(0, 'orders');
    clickSave();
    expect(await screen.findByText('Failed to save local merge model')).toBeInTheDocument();
  });
});

describe('LocalMergeModelEditForm — edit mode', () => {
  it('initializes from the model, trimming/parsing refs and dropping blanks', () => {
    renderEdit();
    expect(screen.getByLabelText('Name')).toHaveValue('merged_orders');
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('code')).toHaveValue('select * from m');

    const refs = screen.getAllByTestId('ref-selector');
    expect(refs).toHaveLength(3);
    expect(refs[0]).toHaveValue('orders');
    expect(refs[1]).toHaveValue('items');
    expect(refs[2]).toHaveValue('plain_model');
  });

  it('falls back to one empty ref row when the model has no models', () => {
    render(
      <LocalMergeModelEditForm
        model={{ name: 'lm', status: 'published', config: { sql: 'select 1' } }}
        isCreate={false}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const refs = screen.getAllByTestId('ref-selector');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toHaveValue('');
  });

  it('re-saves the parsed model refs', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderEdit({ onSave });
    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('localMergeModel', 'merged_orders', {
      name: 'merged_orders',
      sql: 'select * from m',
      models: ['orders', 'items', 'plain_model'],
    });
  });
});

describe('LocalMergeModelEditForm — delete flow', () => {
  it('shows the published confirmation and can be cancelled', () => {
    renderEdit();
    fireEvent.click(screen.getByTitle('Delete model'));
    expect(screen.getByText(/mark it for deletion on commit/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockState.deleteLocalMergeModel).not.toHaveBeenCalled();
  });

  it('shows the discard-changes confirmation for a new model', () => {
    const model = editModel();
    model.status = 'new';
    render(
      <LocalMergeModelEditForm model={model} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />
    );
    fireEvent.click(screen.getByTitle('Delete model'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
  });

  it('deletes the model, refreshes commit status, and closes on success', async () => {
    const onClose = jest.fn();
    renderEdit({ onClose });
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() =>
      expect(mockState.deleteLocalMergeModel).toHaveBeenCalledWith('merged_orders')
    );
    await waitFor(() => expect(mockState.checkCommitStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('surfaces a failed delete and hides the confirmation', async () => {
    mockState.deleteLocalMergeModel.mockResolvedValueOnce({ success: false, error: 'in use' });
    const onClose = jest.fn();
    renderEdit({ onClose });
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('in use')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockState.checkCommitStatus).not.toHaveBeenCalled();
  });

  it('surfaces a thrown delete error', async () => {
    mockState.deleteLocalMergeModel.mockRejectedValueOnce(new Error('boom'));
    renderEdit();
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
  });

  it('does not offer delete in create mode', () => {
    renderCreate();
    expect(screen.queryByTitle('Delete model')).not.toBeInTheDocument();
  });
});

describe('LocalMergeModelEditForm — cancel', () => {
  it('invokes onClose from the footer button', () => {
    const onClose = jest.fn();
    renderCreate({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
