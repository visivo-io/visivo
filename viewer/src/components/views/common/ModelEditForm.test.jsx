import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ModelEditForm from './ModelEditForm';

// Selector-aware store mock: ModelEditForm pulls individual actions via
// useStore(state => state.x), so the default export must apply selectors.
const mockState = {
  deleteModel: jest.fn(),
  checkCommitStatus: jest.fn(),
  fetchSources: jest.fn(),
};
jest.mock('../../../stores/store', () => {
  const useStore = selector => (typeof selector === 'function' ? selector(mockState) : mockState);
  useStore.getState = () => mockState;
  return {
    __esModule: true,
    ObjectStatus: { NEW: 'new', MODIFIED: 'modified', PUBLISHED: 'published', DELETED: 'deleted' },
    default: useStore,
  };
});

// Edit-mode auto-save routes through the unified useRecordSave backbone; a
// controllable stub lets tests assert the scheduled config + drive the
// status/errors the footer indicator reflects.
const mockScheduleSave = jest.fn();
let mockRecordSave;
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => mockRecordSave,
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
  fireEvent.change(screen.getByLabelText('Name'), { target: { value } });
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
  mockRecordSave = {
    scheduleSave: mockScheduleSave,
    status: 'idle',
    errors: null,
    saveNow: jest.fn(),
    reset: jest.fn(),
  };
});

// Edit mode auto-saves after a setTimeout(0) flips the hydration guard on;
// render under fake timers and flush it so subsequent edits count as real
// changes (not hydration).
const renderEditHydrated = (model, extraProps = {}) => {
  const utils = render(
    <ModelEditForm model={model} onSave={jest.fn()} onCancel={jest.fn()} {...extraProps} />
  );
  act(() => {
    jest.advanceTimersByTime(1);
  });
  mockScheduleSave.mockClear(); // ignore any hydration-time noise
  return utils;
};

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
    expect(screen.getByLabelText('Name')).toHaveValue('orders');
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('code')).toHaveValue('select * from orders');
    expect(screen.getByTestId('ref-selector')).toHaveValue('ref(warehouse)');
    expect(screen.getByRole('button', { name: /region/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revenue/ })).toBeInTheDocument();
  });

  it('resets the form when the model prop is cleared', () => {
    const { rerender } = render(
      <ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />
    );
    expect(screen.getByLabelText('Name')).toHaveValue('orders');

    rerender(<ModelEditForm model={null} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Name')).toBeEnabled();
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

});

describe('ModelEditForm — inline dimensions', () => {
  it('Add appends a row and navigates with an applyToParent writing the new index', () => {
    const onNavigateToEmbedded = jest.fn();
    render(
      <ModelEditForm
        model={editModel()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onNavigateToEmbedded={onNavigateToEmbedded}
      />
    );
    // Dimensions section renders its Add button before the metrics one.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    // The new (unnamed) dimension renders with the fallback label at index 1.
    expect(screen.getByRole('button', { name: /Dimension 2/ })).toBeInTheDocument();
    expect(onNavigateToEmbedded).toHaveBeenCalledWith(
      'dimension',
      expect.objectContaining({
        name: '(new dimension)',
        config: { name: '', expression: '' },
        _embedded: { parentType: 'model', parentName: 'orders', path: 'dimensions[1]' },
      }),
      { applyToParent: expect.any(Function) }
    );

    const { applyToParent } = onNavigateToEmbedded.mock.calls[0][2];
    expect(
      applyToParent(
        { dimensions: [{ name: 'region', expression: 'region' }] },
        { name: 'city', expression: 'city' }
      )
    ).toEqual({
      dimensions: [
        { name: 'region', expression: 'region' },
        { name: 'city', expression: 'city' },
      ],
    });
  });

  it('clicking a row navigates with a setAtPath-based applyToParent', () => {
    const onNavigateToEmbedded = jest.fn();
    render(
      <ModelEditForm
        model={editModel()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onNavigateToEmbedded={onNavigateToEmbedded}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /region/ }));

    expect(onNavigateToEmbedded).toHaveBeenCalledWith(
      'dimension',
      expect.objectContaining({
        name: 'region',
        config: { name: 'region', expression: 'region' },
        _embedded: { parentType: 'model', parentName: 'orders', path: 'dimensions[0]' },
      }),
      { applyToParent: expect.any(Function) }
    );

    const { applyToParent } = onNavigateToEmbedded.mock.calls[0][2];
    expect(
      applyToParent(
        { sql: 'select 1', dimensions: [{ name: 'region', expression: 'region' }] },
        { name: 'region', expression: 'upper(region)' }
      )
    ).toEqual({
      sql: 'select 1',
      dimensions: [{ name: 'region', expression: 'upper(region)' }],
    });
  });

  it('Remove filters the dimension out (auto-save drops the key)', () => {
    jest.useFakeTimers();
    renderEditHydrated(editModel());
    fireEvent.click(screen.getByTitle('Remove dimension'));

    expect(screen.queryByRole('button', { name: /region/ })).not.toBeInTheDocument();
    expect(screen.getByText('No inline dimensions defined.')).toBeInTheDocument();

    expect(mockScheduleSave).toHaveBeenCalled();
    const config = mockScheduleSave.mock.calls.at(-1)[0];
    expect(config.dimensions).toBeUndefined();
    expect(config.metrics).toEqual([{ name: 'revenue', expression: 'sum(amount)' }]);
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

describe('ModelEditForm — inline metrics', () => {
  it('Add appends a row and navigates with an applyToParent writing the new index', () => {
    const onNavigateToEmbedded = jest.fn();
    render(
      <ModelEditForm
        model={editModel()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onNavigateToEmbedded={onNavigateToEmbedded}
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1]);

    expect(screen.getByRole('button', { name: /Metric 2/ })).toBeInTheDocument();
    expect(onNavigateToEmbedded).toHaveBeenCalledWith(
      'metric',
      expect.objectContaining({
        name: '(new metric)',
        _embedded: { parentType: 'model', parentName: 'orders', path: 'metrics[1]' },
      }),
      { applyToParent: expect.any(Function) }
    );

    const { applyToParent } = onNavigateToEmbedded.mock.calls[0][2];
    expect(
      applyToParent(
        { metrics: [{ name: 'revenue', expression: 'sum(amount)' }] },
        { name: 'orders_count', expression: 'count(*)' }
      )
    ).toEqual({
      metrics: [
        { name: 'revenue', expression: 'sum(amount)' },
        { name: 'orders_count', expression: 'count(*)' },
      ],
    });
  });

  it('clicking a row navigates with a setAtPath-based applyToParent', () => {
    const onNavigateToEmbedded = jest.fn();
    render(
      <ModelEditForm
        model={editModel()}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        onNavigateToEmbedded={onNavigateToEmbedded}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /revenue/ }));

    expect(onNavigateToEmbedded).toHaveBeenCalledWith(
      'metric',
      expect.objectContaining({
        name: 'revenue',
        _embedded: { parentType: 'model', parentName: 'orders', path: 'metrics[0]' },
      }),
      { applyToParent: expect.any(Function) }
    );

    const { applyToParent } = onNavigateToEmbedded.mock.calls[0][2];
    expect(
      applyToParent(
        { metrics: [{ name: 'revenue', expression: 'sum(amount)' }] },
        { name: 'revenue', expression: 'sum(net_amount)' }
      )
    ).toEqual({ metrics: [{ name: 'revenue', expression: 'sum(net_amount)' }] });
  });

  it('Remove filters the metric out (auto-save drops the key)', () => {
    jest.useFakeTimers();
    renderEditHydrated(editModel());
    fireEvent.click(screen.getByTitle('Remove metric'));

    expect(screen.queryByRole('button', { name: /revenue/ })).not.toBeInTheDocument();
    expect(screen.getByText('No inline metrics defined.')).toBeInTheDocument();

    expect(mockScheduleSave).toHaveBeenCalled();
    const config = mockScheduleSave.mock.calls.at(-1)[0];
    expect(config.metrics).toBeUndefined();
    expect(config.dimensions).toEqual([{ name: 'region', expression: 'region' }]);
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

describe('ModelEditForm — delete flow', () => {
  it('shows the published-model confirmation and can be cancelled', () => {
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete model'));
    expect(
      screen.getByText(/mark it for deletion and remove it from YAML/)
    ).toBeInTheDocument();

    // The confirmation's Cancel renders before the footer Cancel.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockState.deleteModel).not.toHaveBeenCalled();
  });

  it('shows the discard-changes confirmation for a new model', () => {
    const model = editModel();
    model.status = 'new';
    render(<ModelEditForm model={model} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete model'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
  });

  it('deletes the model, refreshes commit status, and closes on success', async () => {
    const onCancel = jest.fn();
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() => expect(mockState.deleteModel).toHaveBeenCalledWith('orders'));
    await waitFor(() => expect(mockState.checkCommitStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('surfaces a failed delete and hides the confirmation', async () => {
    mockState.deleteModel.mockResolvedValueOnce({ success: false, error: 'model in use' });
    const onCancel = jest.fn();
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('model in use')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(mockState.checkCommitStatus).not.toHaveBeenCalled();
  });

  it('surfaces a thrown delete error', async () => {
    mockState.deleteModel.mockRejectedValueOnce(new Error('network down'));
    render(<ModelEditForm model={editModel()} onSave={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete model'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('network down')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
  });

  it('does not offer delete in create mode', () => {
    render(<ModelEditForm model={null} onSave={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTitle('Delete model')).not.toBeInTheDocument();
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

describe('ModelEditForm — edit-mode auto-save (workspace rail)', () => {
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
    renderEditHydrated(editModel());
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    // No delete confirmation open → no Cancel button either.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('form-footer-autosave')).toBeInTheDocument();
    // Delete affordance stays available.
    expect(screen.getByTitle('Delete model')).toBeInTheDocument();
  });

  it('does not schedule a save on hydration (only on a real edit)', () => {
    // renderEditHydrated clears scheduleSave after hydration; assert it stays
    // untouched until the user actually edits.
    renderEditHydrated(editModel());
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });

  it('schedules the full config (ref source, dimensions, metrics) on a field edit', () => {
    renderEditHydrated(editModel());
    setSql('select 2 from orders');
    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'orders',
        sql: 'select 2 from orders',
        source: 'ref(warehouse)',
        dimensions: [{ name: 'region', expression: 'region' }],
        metrics: [{ name: 'revenue', expression: 'sum(amount)' }],
      })
    );
  });

  it('preserves the embedded source object in the scheduled config', () => {
    renderEditHydrated(embeddedModel());
    setSql('select 2');
    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({ source: { type: 'duckdb', database: 'local.db' } })
    );
  });

  it('does not schedule a save while the local minimums are missing', () => {
    renderEditHydrated(editModel());
    setSql('   '); // clear SQL → below the name+sql minimum
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
    renderEditHydrated(editModel());
    expect(screen.getByTestId('model-gate-errors')).toHaveTextContent(
      'sql: must be a valid query'
    );
  });
});
