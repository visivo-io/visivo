import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CsvScriptModelEditForm from './CsvScriptModelEditForm';

// Selector-aware store mock (form pulls actions via useStore(state => state.x)).
const mockState = {
  deleteCsvScriptModel: jest.fn(),
  checkCommitStatus: jest.fn(),
};
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'new', MODIFIED: 'modified', PUBLISHED: 'published', DELETED: 'deleted' },
  default: selector => (typeof selector === 'function' ? selector(mockState) : mockState),
}));

// Edit-mode auto-save routes through the unified useRecordSave backbone; a
// controllable stub lets tests assert the scheduled config + drive status/errors.
const mockScheduleSave = jest.fn();
let mockRecordSave;
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => mockRecordSave,
}));

const setName = value =>
  fireEvent.change(screen.getByLabelText('Name'), { target: { value } });
const setTableName = value =>
  fireEvent.change(screen.getByLabelText('Table Name'), { target: { value } });
const setCommand = value =>
  fireEvent.change(screen.getByPlaceholderText('command (e.g. cat, python)'), {
    target: { value },
  });
const setArg = (index, value) =>
  fireEvent.change(screen.getAllByPlaceholderText('argument')[index], { target: { value } });
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const clickAdd = () => fireEvent.click(screen.getByRole('button', { name: 'Add' }));

const editModel = () => ({
  name: 'csv_orders',
  status: 'published',
  config: {
    name: 'csv_orders',
    table_name: 'orders_tbl',
    allow_empty: true,
    args: ['python', 'generate.py'],
  },
});

const renderCreate = (props = {}) =>
  render(<CsvScriptModelEditForm isCreate onSave={jest.fn()} onClose={jest.fn()} {...props} />);

const renderEdit = (props = {}) =>
  render(
    <CsvScriptModelEditForm
      model={editModel()}
      isCreate={false}
      onSave={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockState.deleteCsvScriptModel.mockResolvedValue({ success: true });
  mockState.checkCommitStatus.mockResolvedValue({ success: true });
  mockRecordSave = {
    scheduleSave: mockScheduleSave,
    status: 'idle',
    errors: null,
    saveNow: jest.fn(),
    reset: jest.fn(),
  };
});

// Edit mode auto-saves after a setTimeout(0) flips the hydration guard on;
// render under fake timers and flush it so subsequent edits count as real edits.
const renderEditHydrated = (props = {}) => {
  const utils = renderEdit(props);
  act(() => {
    jest.advanceTimersByTime(1);
  });
  mockScheduleSave.mockClear();
  return utils;
};

describe('CsvScriptModelEditForm — create mode', () => {
  it('renders defaults: table name "model", unchecked allow-empty, one arg row', () => {
    renderCreate();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Table Name')).toHaveValue('model');
    expect(screen.getByLabelText('Allow Empty Output')).not.toBeChecked();
    expect(screen.getByPlaceholderText('command (e.g. cat, python)')).toHaveValue('');
    expect(screen.queryByTestId('RemoveIcon')).not.toBeInTheDocument();
  });

  it('disables Save until name and at least one non-blank arg are provided', () => {
    renderCreate();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    setName('csv1');
    expect(save).toBeDisabled(); // args still blank

    setCommand('echo');
    expect(save).toBeEnabled();

    setCommand('   ');
    expect(save).toBeDisabled();
  });

  it('saves trimmed config with filtered args and default table name, omitting allow_empty', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderCreate({ onSave });
    setName('  csv1  ');
    setTableName('   '); // blank after trim → falls back to 'model'
    setCommand('echo');
    clickAdd();
    setArg(0, 'hello');
    clickAdd();
    // Second added arg left blank → filtered out of the payload.

    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('csvScriptModel', 'csv1', {
      name: 'csv1',
      table_name: 'model',
      args: ['echo', 'hello'],
    });
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('includes allow_empty and the custom trimmed table name when set', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderCreate({ onSave });
    setName('csv1');
    setTableName('  staging  ');
    fireEvent.click(screen.getByLabelText('Allow Empty Output'));
    setCommand('cat');

    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('csvScriptModel', 'csv1', {
      name: 'csv1',
      table_name: 'staging',
      args: ['cat'],
      allow_empty: true,
    });
  });

  it('adds and removes arg rows, keeping the surviving values', () => {
    renderCreate();
    setCommand('python');
    clickAdd();
    setArg(0, 'a.py');
    clickAdd();
    setArg(1, '--verbose');

    // Three rows → three remove buttons (only shown when args.length > 1).
    expect(screen.getAllByTestId('RemoveIcon')).toHaveLength(3);
    fireEvent.click(screen.getAllByTestId('RemoveIcon')[1]); // drop 'a.py'

    expect(screen.getByPlaceholderText('command (e.g. cat, python)')).toHaveValue('python');
    const argInputs = screen.getAllByPlaceholderText('argument');
    expect(argInputs).toHaveLength(1);
    expect(argInputs[0]).toHaveValue('--verbose');
  });

  it('surfaces the error returned by a failed save', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'script not found' }));
    renderCreate({ onSave });
    setName('csv1');
    setCommand('cat');
    clickSave();
    expect(await screen.findByText('script not found')).toBeInTheDocument();
  });

  it('falls back to a generic message when save resolves with nothing', async () => {
    const onSave = jest.fn(async () => undefined);
    renderCreate({ onSave });
    setName('csv1');
    setCommand('cat');
    clickSave();
    expect(await screen.findByText('Failed to save CSV script model')).toBeInTheDocument();
  });
});

describe('CsvScriptModelEditForm — edit mode', () => {
  it('initializes fields from the model and locks the name', () => {
    renderEdit();
    expect(screen.getByLabelText('Name')).toHaveValue('csv_orders');
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Table Name')).toHaveValue('orders_tbl');
    expect(screen.getByLabelText('Allow Empty Output')).toBeChecked();
    expect(screen.getByPlaceholderText('command (e.g. cat, python)')).toHaveValue('python');
    expect(screen.getByPlaceholderText('argument')).toHaveValue('generate.py');
  });

  it('falls back to defaults when the model config has no table name or args', () => {
    render(
      <CsvScriptModelEditForm
        model={{ name: 'bare', status: 'published', config: {} }}
        isCreate={false}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Table Name')).toHaveValue('model');
    expect(screen.getByLabelText('Allow Empty Output')).not.toBeChecked();
    expect(screen.getByPlaceholderText('command (e.g. cat, python)')).toHaveValue('');
  });

});

describe('CsvScriptModelEditForm — edit-mode auto-save', () => {
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
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('form-footer-autosave')).toBeInTheDocument();
    expect(screen.getByTitle('Delete model')).toBeInTheDocument();
  });

  it('does not schedule a save on hydration (only on a real edit)', () => {
    renderEditHydrated();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });

  it('schedules the full config when a field changes', () => {
    renderEditHydrated();
    setTableName('renamed_tbl');
    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'csv_orders',
        table_name: 'renamed_tbl',
        args: ['python', 'generate.py'],
        allow_empty: true,
      })
    );
  });

  it('surfaces schema gate errors reported by the backbone', () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      status: 'invalid',
      errors: [{ path: 'args', message: 'must be a non-empty list' }],
      saveNow: jest.fn(),
      reset: jest.fn(),
    };
    renderEditHydrated();
    expect(screen.getByTestId('csvScriptModel-gate-errors')).toHaveTextContent(
      'args: must be a non-empty list'
    );
  });
});

describe('CsvScriptModelEditForm — delete flow', () => {
  it('shows the published confirmation and can be cancelled', () => {
    renderEdit();
    fireEvent.click(screen.getByTitle('Delete model'));
    expect(screen.getByText(/mark it for deletion on commit/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockState.deleteCsvScriptModel).not.toHaveBeenCalled();
  });

  it('shows the discard-changes confirmation for a new model', () => {
    const model = editModel();
    model.status = 'new';
    render(
      <CsvScriptModelEditForm model={model} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />
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
      expect(mockState.deleteCsvScriptModel).toHaveBeenCalledWith('csv_orders')
    );
    await waitFor(() => expect(mockState.checkCommitStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('surfaces a failed delete and hides the confirmation', async () => {
    mockState.deleteCsvScriptModel.mockResolvedValueOnce({ success: false, error: 'locked' });
    const onClose = jest.fn();
    renderEdit({ onClose });
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockState.checkCommitStatus).not.toHaveBeenCalled();
  });

  it('surfaces a thrown delete error', async () => {
    mockState.deleteCsvScriptModel.mockRejectedValueOnce(new Error('exploded'));
    renderEdit();
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('exploded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
  });

  it('does not offer delete in create mode', () => {
    renderCreate();
    expect(screen.queryByTitle('Delete model')).not.toBeInTheDocument();
  });
});

describe('CsvScriptModelEditForm — cancel', () => {
  it('invokes onClose from the footer button', () => {
    const onClose = jest.fn();
    renderCreate({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
