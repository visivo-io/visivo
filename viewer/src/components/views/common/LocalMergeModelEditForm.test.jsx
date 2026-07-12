/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

// Edit-mode auto-save routes through the unified useRecordSave backbone; a
// controllable stub lets tests assert the scheduled config + drive the
// status/errors the footer indicator reflects.
const mockScheduleSave = jest.fn();
let mockRecordSave;
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => mockRecordSave,
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

// Edit mode auto-saves after a setTimeout(0) flips the hydration guard on;
// render under fake timers and flush it so subsequent edits count as real
// changes (not hydration).
const renderEditHydrated = (props = {}) => {
  const utils = renderEdit(props);
  act(() => {
    jest.advanceTimersByTime(1);
  });
  mockScheduleSave.mockClear(); // ignore any hydration-time noise
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockState.deleteLocalMergeModel.mockResolvedValue({ success: true });
  mockState.checkCommitStatus.mockResolvedValue({ success: true });
  mockRecordSave = {
    scheduleSave: mockScheduleSave,
    status: 'idle',
    errors: null,
    saveNow: jest.fn(),
    reset: jest.fn(),
  };
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

  it('does not render the auto-save indicator in create mode', () => {
    renderCreate();
    expect(screen.queryByTestId('form-footer-autosave')).not.toBeInTheDocument();
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });
});

describe('LocalMergeModelEditForm — edit mode initialization', () => {
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
});

describe('LocalMergeModelEditForm — edit-mode auto-save (workspace rail)', () => {
  // The post-hydration guard uses setTimeout(0); fake timers make the
  // hydrate-then-edit sequencing deterministic.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows the SaveStateIndicator instead of a Save/Cancel footer', () => {
    renderEditHydrated();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    // No delete confirmation open → no footer Cancel button either.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('form-footer-autosave')).toBeInTheDocument();
    // Delete affordance stays available.
    expect(screen.getByTitle('Delete model')).toBeInTheDocument();
  });

  it('does not schedule a save on hydration (only on a real edit)', () => {
    // renderEditHydrated clears scheduleSave after hydration; assert it stays
    // untouched until the user actually edits.
    renderEditHydrated();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });

  it('schedules the full parsed config (name, sql, models) on a field edit', () => {
    renderEditHydrated();
    setSql('select 99 from m');
    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'merged_orders',
        sql: 'select 99 from m',
        models: ['orders', 'items', 'plain_model'],
      })
    );
  });

  it('schedules the updated models list when a ref row changes', () => {
    renderEditHydrated();
    setRef(0, 'ref(new_orders)');
    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['new_orders', 'items', 'plain_model'],
      })
    );
  });

  it('does not schedule a save while the local minimums are missing', () => {
    renderEditHydrated();
    setSql('   '); // clear SQL → below the name+sql+ref minimum
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });

  it('surfaces schema gate errors reported by the backbone', () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      status: 'invalid',
      errors: [{ path: 'sql', message: 'must be a valid query' }],
      saveNow: jest.fn(),
      reset: jest.fn(),
    };
    renderEditHydrated();
    expect(screen.getByTestId('localMergeModel-gate-errors')).toHaveTextContent(
      'sql: must be a valid query'
    );
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
