/**
 * InsightEditForm tests — interaction-depth coverage of the real branches:
 *  - create vs edit initialization from the insight prop (props/interactions parsing);
 *  - validation failures (name required / name pattern) blocking onSave;
 *  - save success payload shape (props + description + non-empty interactions only)
 *    and save failure surfacing;
 *  - interactions add / retype / edit / remove;
 *  - embedded insights (no name field, nameless config, back navigation, no delete);
 *  - delete confirm flow (published vs NEW copy, cancel, failure);
 *  - schema loading / cached / error / empty states;
 *  - the live preview payload (debounce mocked to identity).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import selectEvent from 'react-select-event';
import InsightEditForm from './InsightEditForm';
import useStore, { ObjectStatus } from '../../../stores/store';

// Leaf editors are exercised by their own tests — stub them per the editForms
// convention. RequiredFieldsSection renders through this same RefTextArea mock.
jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ label, value, onChange, error }) => (
    <>
      <textarea
        aria-label={label || 'ref'}
        value={value || ''}
        onChange={e => onChange?.(e.target.value)}
      />
      {error && <span>{error}</span>}
    </>
  ),
}));

// The SchemaEditor stub exposes the two contract points the form relies on:
// merging extra props into propsValues via onChange, and excluding type +
// required-field names from the "Additional Properties" editor.
jest.mock('./SchemaEditor', () => ({
  __esModule: true,
  SchemaEditor: ({ value, onChange, excludeProperties }) => (
    <div data-testid="schema-editor" data-exclude={JSON.stringify(excludeProperties)}>
      <button type="button" onClick={() => onChange({ ...value, hovertemplate: 'HT' })}>
        set-extra-prop
      </button>
    </div>
  ),
}));

jest.mock('../../../schemas/schemas', () => ({
  __esModule: true,
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter / Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'heatmap', label: 'Heatmap' },
  ],
  getSchema: jest.fn(),
  isSchemaLoaded: jest.fn(),
  preloadSchemas: jest.fn(),
}));

// Identity debounce so the preview effect emits synchronously in tests.
jest.mock('../../../hooks/useDebounce', () => ({
  __esModule: true,
  useDebounce: v => v,
  default: v => v,
}));

const schemas = jest.requireMock('../../../schemas/schemas');

const seed = (overrides = {}) => {
  act(() => {
    useStore.setState({
      deleteInsight: jest.fn(async () => ({ success: true })),
      checkCommitStatus: jest.fn(async () => {}),
      project: { id: 'proj-1' },
      ...overrides,
    });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  schemas.getSchema.mockResolvedValue({ type: 'object', properties: {} });
  schemas.isSchemaLoaded.mockReturnValue(true);
  schemas.preloadSchemas.mockResolvedValue(undefined);
  seed();
});

// Renders and flushes the async schema-load effect so no act() warnings leak.
const renderForm = async (props = {}) => {
  const utils = render(
    <InsightEditForm insight={null} isCreate onClose={jest.fn()} onSave={jest.fn()} {...props} />
  );
  await screen.findByTestId('schema-editor');
  return utils;
};

const publishedInsight = {
  name: 'rev',
  status: ObjectStatus.PUBLISHED,
  config: {
    name: 'rev',
    description: 'revenue insight',
    props: { type: 'bar', x: 'ref(m).x', y: 'ref(m).y' },
    interactions: [{ filter: 'a > 1' }, { split: 'b' }, { sort: 'c DESC' }, {}],
  },
};

const setName = value =>
  fireEvent.change(screen.getByLabelText(/Insight Name/), { target: { value } });

describe('InsightEditForm — create mode', () => {
  test('renders empty defaults: scatter fields, additional props, no interactions', async () => {
    const onClose = jest.fn();
    await renderForm({ onClose });

    expect(screen.getByLabelText(/Insight Name/)).toHaveValue('');
    expect(screen.getByLabelText(/Insight Name/)).not.toBeDisabled();
    // Scatter's required fields render as explicit inputs...
    expect(screen.getByLabelText('X Axis')).toBeInTheDocument();
    expect(screen.getByLabelText('Y Axis')).toBeInTheDocument();
    // ...and are excluded (with `type`) from the Additional Properties editor.
    expect(JSON.parse(screen.getByTestId('schema-editor').dataset.exclude)).toEqual([
      'type',
      'x',
      'y',
    ]);
    expect(screen.getByText('Additional Properties')).toBeInTheDocument();
    expect(screen.getByText(/No interactions defined/)).toBeInTheDocument();
    // No delete affordance in create mode.
    expect(screen.queryByTitle('Delete insight')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('blocks save with a required-name error, then a pattern error', async () => {
    const onSave = jest.fn();
    await renderForm({ onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    setName('bad name!');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'Name must start with a letter or number and contain only letters, numbers, underscores, and hyphens'
      )
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('saves the full config payload: name, typed props, extra props, description', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    await renderForm({ onSave });

    setName('my_insight');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Revenue by day' },
    });
    fireEvent.change(screen.getByLabelText('X Axis'), { target: { value: 'ref(m).x' } });
    fireEvent.change(screen.getByLabelText('Y Axis'), { target: { value: 'ref(m).y' } });
    // SchemaEditor merges an optional prop into propsValues.
    fireEvent.click(screen.getByRole('button', { name: 'set-extra-prop' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, name, config] = onSave.mock.calls[0];
    expect(type).toBe('insight');
    expect(name).toBe('my_insight');
    expect(config).toEqual({
      name: 'my_insight',
      description: 'Revenue by day',
      props: { type: 'scatter', x: 'ref(m).x', y: 'ref(m).y', hovertemplate: 'HT' },
    });
    // Empty interactions/description must not pollute the YAML config.
    expect(config).not.toHaveProperty('interactions');
  });

  test('surfaces a save failure message and recovers', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'name taken' }));
    await renderForm({ onSave });
    setName('dup');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('name taken')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('falls back to a generic error when onSave resolves without a result', async () => {
    const onSave = jest.fn(async () => undefined);
    await renderForm({ onSave });
    setName('nores');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save insight')).toBeInTheDocument();
  });

  test('shows Saving... while the save promise is pending', async () => {
    let resolveSave;
    const onSave = jest.fn(() => new Promise(r => (resolveSave = r)));
    await renderForm({ onSave });
    setName('pending1');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const savingButton = await screen.findByRole('button', { name: /Saving/ });
    expect(savingButton).toBeDisabled();

    await act(async () => resolveSave({ success: true }));
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  test('switching chart type swaps the required fields and loads the new schema', async () => {
    await renderForm();
    // Gate the reloaded schema so its setState can be flushed inside act
    // (otherwise it resolves between selectEvent's internal awaits).
    let resolveHeatmapSchema;
    schemas.getSchema.mockImplementation(() => new Promise(r => (resolveHeatmapSchema = r)));

    await selectEvent.select(screen.getByLabelText('Chart Type'), 'Heatmap', {
      container: document.body,
    });

    expect(await screen.findByLabelText('Z Values')).toBeInTheDocument();
    expect(screen.queryByLabelText('X Axis')).not.toBeInTheDocument();
    expect(schemas.getSchema).toHaveBeenCalledWith('heatmap');
    await act(async () => resolveHeatmapSchema({ type: 'object', properties: {} }));
    expect(screen.getByTestId('schema-editor')).toBeInTheDocument();
  });
});

describe('InsightEditForm — interactions', () => {
  test('adds, retypes, edits and saves only non-empty interactions', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    await renderForm({ onSave });
    setName('i1');

    fireEvent.click(screen.getByRole('button', { name: 'Add Interaction' }));
    expect(screen.queryByText(/No interactions defined/)).not.toBeInTheDocument();
    expect(screen.getByText('Interaction 1')).toBeInTheDocument();
    // New interactions default to filter.
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'region = "US"' } });

    // Second interaction, retyped to Split.
    fireEvent.click(screen.getByRole('button', { name: 'Add Interaction' }));
    await selectEvent.select(screen.getAllByLabelText('Type')[1], 'Split', {
      container: document.body,
    });
    fireEvent.change(screen.getByLabelText('Split'), { target: { value: 'category' } });

    // Third interaction left blank — must be dropped from the payload.
    fireEvent.click(screen.getByRole('button', { name: 'Add Interaction' }));
    expect(screen.getByText('Interaction 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, , config] = onSave.mock.calls[0];
    expect(config.interactions).toEqual([{ filter: 'region = "US"' }, { split: 'category' }]);
  });

  test('removing an interaction drops it from the form and the payload', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <InsightEditForm
        insight={publishedInsight}
        isCreate={false}
        onClose={jest.fn()}
        onSave={onSave}
      />
    );
    await screen.findByTestId('schema-editor');

    // Remove the first (filter 'a > 1') interaction.
    fireEvent.click(screen.getAllByTitle('Remove interaction')[0]);
    expect(screen.queryByText('Interaction 4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, , config] = onSave.mock.calls[0];
    expect(config.interactions).toEqual([{ split: 'b' }, { sort: 'c DESC' }]);
  });
});

describe('InsightEditForm — edit mode', () => {
  test('initializes from the insight config and round-trips it on save', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <InsightEditForm
        insight={publishedInsight}
        isCreate={false}
        onClose={jest.fn()}
        onSave={onSave}
      />
    );
    await screen.findByTestId('schema-editor');

    const nameInput = screen.getByLabelText(/Insight Name/);
    expect(nameInput).toHaveValue('rev');
    expect(nameInput).toBeDisabled();
    expect(screen.getByLabelText('Description')).toHaveValue('revenue insight');
    // Chart type parsed out of props.
    expect(screen.getByText('Bar')).toBeInTheDocument();
    // Each stored interaction kind maps to its editor; the unknown `{}` entry
    // falls back to an empty filter.
    expect(screen.getAllByLabelText('Filter').map(t => t.value)).toEqual(['a > 1', '']);
    expect(screen.getByLabelText('Split')).toHaveValue('b');
    expect(screen.getByLabelText('Sort')).toHaveValue('c DESC');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('insight', 'rev', {
      name: 'rev',
      description: 'revenue insight',
      props: { type: 'bar', x: 'ref(m).x', y: 'ref(m).y' },
      // The empty fallback interaction is dropped; the rest round-trip.
      interactions: [{ filter: 'a > 1' }, { split: 'b' }, { sort: 'c DESC' }],
    });
  });

  test('delete: confirm calls deleteInsight, refreshes commit status and closes', async () => {
    const deleteInsight = jest.fn(async () => ({ success: true }));
    const checkCommitStatus = jest.fn(async () => {});
    seed({ deleteInsight, checkCommitStatus });
    const onClose = jest.fn();
    render(
      <InsightEditForm
        insight={publishedInsight}
        isCreate={false}
        onClose={onClose}
        onSave={jest.fn()}
      />
    );
    await screen.findByTestId('schema-editor');

    fireEvent.click(screen.getByTitle('Delete insight'));
    // Published objects get the mark-for-deletion copy.
    expect(screen.getByText(/mark it for deletion/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() => expect(deleteInsight).toHaveBeenCalledWith('rev'));
    await waitFor(() => expect(checkCommitStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test('delete failure surfaces the error and dismisses the confirm', async () => {
    const deleteInsight = jest.fn(async () => ({ success: false, error: 'cannot delete' }));
    seed({ deleteInsight });
    const onClose = jest.fn();
    render(
      <InsightEditForm
        insight={publishedInsight}
        isCreate={false}
        onClose={onClose}
        onSave={jest.fn()}
      />
    );
    await screen.findByTestId('schema-editor');

    fireEvent.click(screen.getByTitle('Delete insight'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('cannot delete')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('a NEW insight warns about discarding unsaved changes; cancel aborts', async () => {
    const deleteInsight = jest.fn();
    seed({ deleteInsight });
    render(
      <InsightEditForm
        insight={{ ...publishedInsight, status: ObjectStatus.NEW }}
        isCreate={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );
    await screen.findByTestId('schema-editor');

    fireEvent.click(screen.getByTitle('Delete insight'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
    // The confirm block renders above the footer actions, so the first
    // Cancel button is the confirmation's Cancel (the footer's is second).
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(deleteInsight).not.toHaveBeenCalled();
  });
});

describe('InsightEditForm — embedded insights', () => {
  const embeddedInsight = {
    name: 'inline',
    status: ObjectStatus.PUBLISHED,
    _embedded: { parentName: 'sales_chart', parentType: 'chart' },
    config: { props: { type: 'scatter', x: 'ref(m).x' } },
  };

  test('hides name/delete, saves a nameless config, and navigates back', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    const onGoBack = jest.fn();
    render(
      <InsightEditForm
        insight={embeddedInsight}
        isCreate={false}
        onClose={jest.fn()}
        onSave={onSave}
        onGoBack={onGoBack}
      />
    );
    await screen.findByTestId('schema-editor');

    // Embedded insights have no name of their own and can't be deleted here.
    expect(screen.queryByLabelText(/Insight Name/)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete insight')).not.toBeInTheDocument();
    // Back navigation targets the parent object.
    const backButton = screen.getByRole('button', { name: /sales_chart/ });
    fireEvent.click(backButton);
    expect(onGoBack).toHaveBeenCalledTimes(1);

    // Saving skips name validation and omits `name` from the config (the
    // synthetic embedded name still rides along as the routing arg).
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, name, config] = onSave.mock.calls[0];
    expect(type).toBe('insight');
    expect(name).toBe('inline');
    expect(config).toEqual({ props: { type: 'scatter', x: 'ref(m).x' } });
    expect(config).not.toHaveProperty('name');
  });
});

describe('InsightEditForm — schema states', () => {
  test('shows the loading spinner until an uncached schema resolves', async () => {
    schemas.isSchemaLoaded.mockReturnValue(false);
    let resolveSchema;
    schemas.getSchema.mockReturnValue(new Promise(r => (resolveSchema = r)));

    render(<InsightEditForm insight={null} isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByText('Loading schema...')).toBeInTheDocument();

    await act(async () => resolveSchema({ type: 'object' }));
    expect(await screen.findByTestId('schema-editor')).toBeInTheDocument();
    expect(screen.queryByText('Loading schema...')).not.toBeInTheDocument();
  });

  test('shows a schema error (and survives a preload failure) when loading fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    schemas.isSchemaLoaded.mockReturnValue(false);
    schemas.getSchema.mockRejectedValue(new Error('network down'));
    schemas.preloadSchemas.mockRejectedValue(new Error('preload down'));

    render(<InsightEditForm insight={null} isCreate onClose={jest.fn()} onSave={jest.fn()} />);

    expect(await screen.findByText('Failed to load schema for scatter')).toBeInTheDocument();
    expect(screen.queryByTestId('schema-editor')).not.toBeInTheDocument();
    // The form is still usable despite both failures.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  test('shows the empty state when no schema exists for the type', async () => {
    schemas.getSchema.mockResolvedValue(null);
    render(<InsightEditForm insight={null} isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    expect(
      await screen.findByText('Select a chart type to configure properties')
    ).toBeInTheDocument();
  });
});

describe('InsightEditForm — live preview', () => {
  test('emits a preview config with the placeholder name and project id', async () => {
    const setPreviewConfig = jest.fn();
    await renderForm({ setPreviewConfig });

    expect(setPreviewConfig.mock.calls.at(-1)[0]).toEqual({
      insightConfig: { name: '__preview__', props: { type: 'scatter' }, interactions: [] },
      projectId: 'proj-1',
    });

    setName('previewed');
    await waitFor(() =>
      expect(setPreviewConfig.mock.calls.at(-1)[0].insightConfig.name).toBe('previewed')
    );
  });

  test('maps filter/split/sort interactions into the preview payload', async () => {
    const setPreviewConfig = jest.fn();
    render(
      <InsightEditForm
        insight={publishedInsight}
        isCreate={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
        setPreviewConfig={setPreviewConfig}
      />
    );
    await screen.findByTestId('schema-editor');

    const { insightConfig } = setPreviewConfig.mock.calls.at(-1)[0];
    expect(insightConfig.name).toBe('rev');
    expect(insightConfig.props).toEqual({ type: 'bar', x: 'ref(m).x', y: 'ref(m).y' });
    // Unlike save, the preview keeps the empty fallback filter (it is still a
    // keyed interaction) — asserting the exact mapping of all three kinds.
    expect(insightConfig.interactions).toEqual([
      { filter: 'a > 1' },
      { split: 'b' },
      { sort: 'c DESC' },
      { filter: '' },
    ]);
  });
});
