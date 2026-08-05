import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ModelEditForm from './ModelEditForm';

// Selector-aware store mock: ModelEditForm pulls individual actions via
// useStore(state => state.x), so the default export must apply selectors.
const mockState = {
  deleteModel: jest.fn(),
  checkCommitStatus: jest.fn(),
  fetchSources: jest.fn(),
};
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'new', MODIFIED: 'modified', PUBLISHED: 'published', DELETED: 'deleted' },
  default: selector => (typeof selector === 'function' ? selector(mockState) : mockState),
}));

// Monaco doesn't render in jsdom — swap in a plain textarea with the same contract.
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea aria-label="code" value={value || ''} onChange={e => onChange?.(e.target.value)} />
  ),
}));

// Functional RefSelector stub: exposes value + onChange so tests can pick a source ref.
jest.mock('./RefSelector', () => ({
  __esModule: true,
  default: ({ label, value, onChange }) => (
    <input
      data-testid="ref-selector"
      aria-label={label || 'ref-selector'}
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
    />
  ),
}));

const setName = value =>
  fireEvent.change(screen.getByLabelText(/Model Name/), { target: { value } });
const setSql = value =>
  fireEvent.change(screen.getByLabelText('code'), { target: { value } });
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));

const editModel = () => ({
  name: 'orders',
  status: 'published',
  config: {
    name: 'orders',
    sql: 'select * from orders',
    source: 'ref(warehouse)',
    dimensions: [{ name: 'region', expression: 'region' }],
    metrics: [{ name: 'revenue', expression: 'sum(amount)' }],
  },
});

const embeddedModel = () => ({
  name: 'orders',
  status: 'published',
  config: {
    name: 'orders',
    sql: 'select 1',
    source: { type: 'duckdb', database: 'local.db' },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockState.deleteModel.mockResolvedValue({ success: true });
  mockState.checkCommitStatus.mockResolvedValue({ success: true });
});

// VIS-1133: Save is disabled on an untouched edit-mode form. The model NAME is
// disabled in edit mode, so SQL is the lever — assertions move with it rather
// than being weakened.
const makeDirty = (value = 'select * from orders where region is not null') =>
  fireEvent.change(screen.getByLabelText('code'), { target: { value } });

describe('ModelEditForm — create mode', () => {
  it('fetches sources on mount and disables Save until name and sql are provided', () => {
    render(<ModelEditForm model={null} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(mockState.fetchSources).toHaveBeenCalledTimes(1);

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    setName('orders_model');
    expect(save).toBeDisabled();
    setSql('select 1');
    expect(save).toBeEnabled();
    setName('   ');
    expect(save).toBeDisabled();
  });

  it('hides the inline dimension/metric sections in create mode', () => {
    render(<ModelEditForm model={null} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByText('Inline Dimensions')).not.toBeInTheDocument();
    expect(screen.queryByText('Inline Metrics')).not.toBeInTheDocument();
  });

  it('saves a trimmed config omitting source, dimensions, and metrics when unset', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<ModelEditForm model={null} onSave={onSave} onCancel={jest.fn()} />);
    setName('  orders_model  ');
    setSql('  select 1  ');
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('model', 'orders_model', {
      name: 'orders_model',
      sql: 'select 1',
    });
    // Saving state recovers to the idle label.
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('includes the selected ref source in the saved config', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<ModelEditForm model={null} onSave={onSave} onCancel={jest.fn()} />);
    setName('m1');
    setSql('select 1');
    fireEvent.change(screen.getByTestId('ref-selector'), { target: { value: 'ref(pg)' } });
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].source).toBe('ref(pg)');
  });

  it('surfaces the error returned by a failed save', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'name already taken' }));
    render(<ModelEditForm model={null} onSave={onSave} onCancel={jest.fn()} />);
    setName('m1');
    setSql('select 1');
    clickSave();
    expect(await screen.findByText('name already taken')).toBeInTheDocument();
  });

  it('falls back to a generic message when save resolves with nothing', async () => {
    const onSave = jest.fn(async () => undefined);
    render(<ModelEditForm model={null} onSave={onSave} onCancel={jest.fn()} />);
    setName('m1');
    setSql('select 1');
    clickSave();
    expect(await screen.findByText('Failed to save model')).toBeInTheDocument();
  });
});

describe('ModelEditForm — edit mode initialization and save', () => {
  it('initializes fields from the model and locks the name', () => {
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByLabelText(/Model Name/)).toHaveValue('orders');
    expect(screen.getByLabelText(/Model Name/)).toBeDisabled();
    expect(screen.getByLabelText('code')).toHaveValue('select * from orders');
    expect(screen.getByTestId('ref-selector')).toHaveValue('ref(warehouse)');
    expect(screen.getByRole('button', { name: /region/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revenue/ })).toBeInTheDocument();
  });

  it('round-trips ref source, dimensions, and metrics through save', async () => {
    const model = editModel();
    const onSave = jest.fn(async () => ({ success: true }));
    render(<ModelEditForm model={model} onSave={onSave} onCancel={jest.fn()} />);
    makeDirty();
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('model', 'orders', {
      name: 'orders',
      sql: 'select * from orders where region is not null',
      source: 'ref(warehouse)',
      dimensions: [{ name: 'region', expression: 'region' }],
      metrics: [{ name: 'revenue', expression: 'sum(amount)' }],
    });
  });

  it('resets the form when the model prop is cleared', () => {
    const { rerender } = render(
      <ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />
    );
    expect(screen.getByLabelText(/Model Name/)).toHaveValue('orders');

    rerender(<ModelEditForm model={null} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByLabelText(/Model Name/)).toHaveValue('');
    expect(screen.getByLabelText(/Model Name/)).toBeEnabled();
    expect(screen.getByLabelText('code')).toHaveValue('');
  });
});

describe('ModelEditForm — embedded source', () => {
  it('renders the embedded source as a navigation button with a database hint', () => {
    render(<ModelEditForm model={embeddedModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('Source: duckdb')).toBeInTheDocument();
    expect(screen.getByText('Database: local.db')).toBeInTheDocument();
    // The ref selector is replaced by the embedded button.
    expect(screen.queryByTestId('ref-selector')).not.toBeInTheDocument();
  });

  it('falls back to an "embedded" label and hides the database hint when absent', () => {
    const model = embeddedModel();
    model.config.source = {};
    render(<ModelEditForm model={model} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText('Source: embedded')).toBeInTheDocument();
    expect(screen.queryByText(/Database:/)).not.toBeInTheDocument();
  });

  it('navigates to the embedded source with an applyToParent that swaps the source', () => {
    const onNavigateToEmbedded = jest.fn();
    render(
      <ModelEditForm
        model={embeddedModel()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onNavigateToEmbedded={onNavigateToEmbedded}
      />
    );
    fireEvent.click(screen.getByText('Source: duckdb'));

    expect(onNavigateToEmbedded).toHaveBeenCalledWith(
      'source',
      {
        name: '(embedded in orders)',
        config: { type: 'duckdb', database: 'local.db' },
        _embedded: { parentType: 'model', parentName: 'orders', path: 'source' },
      },
      { applyToParent: expect.any(Function) }
    );

    const { applyToParent } = onNavigateToEmbedded.mock.calls[0][2];
    expect(
      applyToParent(
        { name: 'orders', sql: 'select 1', source: { type: 'duckdb' } },
        { type: 'postgresql', host: 'db' }
      )
    ).toEqual({ name: 'orders', sql: 'select 1', source: { type: 'postgresql', host: 'db' } });
  });

  it('does not crash when clicked without an onNavigateToEmbedded handler', () => {
    render(<ModelEditForm model={embeddedModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByText('Source: duckdb'));
    expect(screen.getByText('Source: duckdb')).toBeInTheDocument();
  });

  it('preserves the embedded source object on save', async () => {
    const model = embeddedModel();
    const onSave = jest.fn(async () => ({ success: true }));
    render(<ModelEditForm model={model} onSave={onSave} onCancel={jest.fn()} />);
    makeDirty();
    clickSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].source).toEqual({ type: 'duckdb', database: 'local.db' });
  });
});

describe('ModelEditForm — inline dimensions', () => {
  it('Add appends a row and opens it for editing', () => {
    // The bug: Add appended a row and called `onNavigateToEmbedded` to open it.
    // NOTHING passes that prop — a repo-wide search finds it declared and read
    // in three forms and supplied by none — so the row appeared with an empty
    // name and expression and no way to fill either in. These tests used to
    // pass a mock, which is exactly why the dead path looked healthy.
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    expect(screen.getByTestId('inline-dimension-editor')).toBeInTheDocument();
    expect(screen.getByTestId('inline-dimension-name')).toHaveValue('');
  });

  it('editing the fields updates that row and it survives save', async () => {
    const onSave = jest.fn().mockResolvedValue({ success: true });
    render(<ModelEditForm model={editModel()} onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    fireEvent.change(screen.getByTestId('inline-dimension-name'), {
      target: { value: 'order_month' },
    });
    fireEvent.change(screen.getByTestId('inline-dimension-expression'), {
      target: { value: "DATE_TRUNC('month', order_date)" },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2].dimensions).toContainEqual(
      expect.objectContaining({
        name: 'order_month',
        expression: "DATE_TRUNC('month', order_date)",
      })
    );
  });

  it('a row added but never filled in is not saved', async () => {
    // Otherwise Add-then-Save persists `{name: '', expression: ''}`, which is
    // not a valid dimension and fails on the way back.
    const onSave = jest.fn().mockResolvedValue({ success: true });
    render(<ModelEditForm model={editModel()} onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][2].dimensions || [];
    expect(saved.every(d => d.name || d.expression)).toBe(true);
  });

  it('clicking a row toggles its editor open and closed', () => {
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);

    const row = screen.getByRole('button', { name: /region/ });
    fireEvent.click(row);
    expect(screen.getByTestId('inline-dimension-editor')).toBeInTheDocument();

    fireEvent.click(row);
    expect(screen.queryByTestId('inline-dimension-editor')).not.toBeInTheDocument();
  });

  it('Remove filters the dimension out and the next save drops the key', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<ModelEditForm model={editModel()} onSave={onSave} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Remove dimension'));

    expect(screen.queryByRole('button', { name: /region/ })).not.toBeInTheDocument();
    expect(screen.getByText('No inline dimensions defined.')).toBeInTheDocument();

    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const config = onSave.mock.calls[0][2];
    expect(config.dimensions).toBeUndefined();
    expect(config.metrics).toEqual([{ name: 'revenue', expression: 'sum(amount)' }]);
  });
});

describe('ModelEditForm — inline metrics', () => {
  it('Add appends a row and opens it for editing', () => {
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1]);

    expect(screen.getByTestId('inline-metric-editor')).toBeInTheDocument();
  });

  it('editing the fields updates that row and it survives save', async () => {
    const onSave = jest.fn().mockResolvedValue({ success: true });
    render(<ModelEditForm model={editModel()} onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1]);
    fireEvent.change(screen.getByTestId('inline-metric-name'), {
      target: { value: 'total_revenue' },
    });
    fireEvent.change(screen.getByTestId('inline-metric-expression'), {
      target: { value: 'SUM(amount)' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2].metrics).toContainEqual(
      expect.objectContaining({ name: 'total_revenue', expression: 'SUM(amount)' })
    );
  });

  it('Remove filters the metric out and the next save drops the key', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(<ModelEditForm model={editModel()} onSave={onSave} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Remove metric'));

    expect(screen.queryByRole('button', { name: /revenue/ })).not.toBeInTheDocument();
    expect(screen.getByText('No inline metrics defined.')).toBeInTheDocument();

    clickSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const config = onSave.mock.calls[0][2];
    expect(config.metrics).toBeUndefined();
    expect(config.dimensions).toEqual([{ name: 'region', expression: 'region' }]);
  });
});

describe('ModelEditForm — delete flow', () => {
  it('shows the published-model confirmation and can be cancelled', () => {
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(
      screen.getByText(/mark it for deletion and remove it from YAML/)
    ).toBeInTheDocument();

    // The confirmation's Cancel renders before the footer Cancel.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockState.deleteModel).not.toHaveBeenCalled();
  });

  it('confirming a delete does not also submit the form', async () => {
    // This form is the only one that wraps FormFooter in a <form>, and a
    // <button> with no type inside a form defaults to submit — so Confirm
    // Delete fired the save path too, and the panel showed "Failed to save
    // model" on top of the delete.
    const onSave = jest.fn();
    mockState.deleteModel.mockResolvedValue({ success: true });
    render(<ModelEditForm model={editModel()} onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() => expect(mockState.deleteModel).toHaveBeenCalled());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancelling a delete does not submit either', () => {
    const onSave = jest.fn();
    render(<ModelEditForm model={editModel()} onSave={onSave} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the discard-changes confirmation for a new model', () => {
    const model = editModel();
    model.status = 'new';
    render(<ModelEditForm model={model} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
  });

  it('deletes the model, refreshes commit status, and closes on success', async () => {
    const onCancel = jest.fn();
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() => expect(mockState.deleteModel).toHaveBeenCalledWith('orders'));
    await waitFor(() => expect(mockState.checkCommitStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('surfaces a failed delete and hides the confirmation', async () => {
    mockState.deleteModel.mockResolvedValueOnce({ success: false, error: 'model in use' });
    const onCancel = jest.fn();
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('model in use')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(mockState.checkCommitStatus).not.toHaveBeenCalled();
  });

  it('surfaces a thrown delete error', async () => {
    mockState.deleteModel.mockRejectedValueOnce(new Error('network down'));
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('network down')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
  });

  it('does not offer delete in create mode', () => {
    render(<ModelEditForm model={null} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });
});

describe('ModelEditForm — cancel', () => {
  it('invokes onCancel from the footer button', () => {
    const onCancel = jest.fn();
    render(<ModelEditForm model={null} onSave={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// VIS-1133. In the persistent rail there is no modal to close, so the footer's
// left button reverts instead — and both buttons stay inert until something
// actually changed. Create mode (a modal host) keeps a real Cancel.
describe('ModelEditForm — Discard (edit mode)', () => {
  it('labels the button Discard in edit mode and Cancel in create mode', () => {
    const { unmount } = render(
      <ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />
    );
    expect(screen.getByTestId('form-footer-cancel')).toHaveTextContent('Discard');
    unmount();

    render(<ModelEditForm model={null} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('form-footer-cancel')).toHaveTextContent('Cancel');
  });

  it('disables Save and Discard on an untouched form', () => {
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByTestId('form-footer-cancel')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('enables both once a field changes, and Discard puts it back', () => {
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);

    makeDirty('select 1');
    expect(screen.getByLabelText('code')).toHaveValue('select 1');
    expect(screen.getByTestId('form-footer-cancel')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.click(screen.getByTestId('form-footer-cancel'));

    expect(screen.getByLabelText('code')).toHaveValue('select * from orders');
    // Back to clean, so both go inert again.
    expect(screen.getByTestId('form-footer-cancel')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('restores inline dimensions and metrics too, not just scalar fields', () => {
    // These are arrays rebuilt on every render — reference comparison would
    // have reported the form permanently dirty and made Discard a no-op.
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByRole('button', { name: /region/ })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    expect(screen.getByTestId('form-footer-cancel')).toBeEnabled();

    fireEvent.click(screen.getByTestId('form-footer-cancel'));

    expect(screen.queryByTestId('inline-dimension-editor')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /region/ })).toBeInTheDocument();
  });

  it('a saved edit clears dirty — the form does not stay stuck', () => {
    // The baseline advances when the record prop changes identity, which is
    // exactly what useRecordSave's optimistic write does after a save. Without
    // it, Save would light up forever and Discard would offer to undo
    // already-committed work.
    const { rerender } = render(
      <ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />
    );
    makeDirty('select 1');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    const saved = editModel();
    saved.config.sql = 'select 1';
    rerender(<ModelEditForm model={saved} onSave={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByTestId('form-footer-cancel')).toBeDisabled();
  });

  it('reports dirtiness upward so the tab strip can show its unsaved dot', () => {
    const onDirtyChange = jest.fn();
    render(
      <ModelEditForm
        model={editModel()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onDirtyChange={onDirtyChange}
      />
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    makeDirty('select 1');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByTestId('form-footer-cancel'));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
