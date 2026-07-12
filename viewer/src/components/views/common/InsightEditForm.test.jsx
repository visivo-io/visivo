/**
 * InsightEditForm tests — interaction-depth coverage of the real branches, wired
 * to the controlled <TracePropsEditor> (VIS-1020):
 *  - create vs edit initialization from the insight prop (props/interactions parsing);
 *  - the props-state contract: the form owns a single `props` object (carrying
 *    `.type`), hands it to TracePropsEditor, and persists it verbatim on save;
 *  - validation failures (name required / name pattern / missing props.type)
 *    blocking onSave;
 *  - save success payload shape (props + description + non-empty interactions only)
 *    and save failure surfacing;
 *  - interactions add / retype / edit / remove;
 *  - embedded insights (no name field, nameless config, back navigation, no delete);
 *  - delete confirm flow (published vs NEW copy, cancel, failure);
 *  - the live preview payload (debounce mocked to identity).
 *
 * VIS-1018: EDIT mode now auto-saves through the unified `useRecordSave` backbone
 * — there is no Save button in edit mode, only a save-state indicator. Edit-mode
 * assertions therefore verify the debounced `scheduleSave(config)` (mocked via a
 * controllable stub) rather than clicking Save. CREATE mode keeps its Save button.
 *
 * TracePropsEditor is mocked to a tiny stub that (a) echoes `props.type` +
 * `ownerName` so we can assert the controlled value flows in, and (b) exposes
 * buttons that call `onChange` with mutated props objects so we can assert edits
 * flow back out into the saved config. The editor's own rendering (grouped
 * fields, AJV errors, schema loading/error states) is covered by
 * TracePropsEditor.test.jsx.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import selectEvent from 'react-select-event';
import InsightEditForm from './InsightEditForm';
import useStore, { ObjectStatus } from '../../../stores/store';

// Edit-mode auto-save routes through the unified useRecordSave backbone; a
// controllable stub lets tests assert the scheduled config + drive the
// status/errors the footer indicator and gate-error banner reflect.
const mockScheduleSave = jest.fn();
let mockRecordSave;
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => mockRecordSave,
}));

// TracePropsEditor stub: echo ownerName + props.type, and expose buttons that
// drive onChange so we can assert the parent persists the edited props.
jest.mock('./TracePropsEditor', () => ({
  __esModule: true,
  default: ({ ownerName, props, onChange, onValidityChange }) => (
    <div data-testid="trace-props-editor" data-owner={ownerName}>
      <span data-testid="tpe-type">{props?.type}</span>
      <button
        type="button"
        data-testid="tpe-set-bar"
        onClick={() => onChange({ type: 'bar', x: ['a', 'b'] })}
      >
        set bar
      </button>
      <button
        type="button"
        data-testid="tpe-report-invalid"
        onClick={() => onValidityChange?.(false, { mode: 'must be a valid mode' })}
      >
        report invalid
      </button>
      <button
        type="button"
        data-testid="tpe-report-valid"
        onClick={() => onValidityChange?.(true, {})}
      >
        report valid
      </button>
      <button
        type="button"
        data-testid="tpe-add-prop"
        onClick={() => onChange({ ...props, marker: { color: 'red' } })}
      >
        add prop
      </button>
      <button type="button" data-testid="tpe-clear-type" onClick={() => onChange({})}>
        clear type
      </button>
    </div>
  ),
}));

// Interactions editor leaf — keep it a plain textarea.
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

// Identity debounce so the preview effect emits synchronously in tests.
jest.mock('../../../hooks/useDebounce', () => ({
  __esModule: true,
  useDebounce: v => v,
  default: v => v,
}));

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
  seed();
  mockRecordSave = {
    scheduleSave: mockScheduleSave,
    status: 'idle',
    errors: null,
    saveNow: jest.fn(),
    reset: jest.fn(),
  };
});

const renderForm = async (props = {}) => {
  const utils = render(
    <InsightEditForm insight={null} isCreate onClose={jest.fn()} onSave={jest.fn()} {...props} />
  );
  await screen.findByTestId('trace-props-editor');
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

const embeddedInsight = {
  name: 'inline',
  status: ObjectStatus.PUBLISHED,
  _embedded: { parentName: 'sales_chart', parentType: 'chart' },
  config: { props: { type: 'scatter', x: 'ref(m).x' } },
};

// Edit mode auto-saves after a setTimeout(0) flips the hydration guard on;
// render under fake timers and flush it so subsequent edits count as real
// changes (not hydration). Mirrors ModelEditForm.test.jsx's renderEditHydrated.
const renderEditHydrated = (insight = publishedInsight, extraProps = {}) => {
  const utils = render(
    <InsightEditForm
      insight={insight}
      isCreate={false}
      onClose={jest.fn()}
      onSave={jest.fn()}
      {...extraProps}
    />
  );
  act(() => {
    jest.advanceTimersByTime(1);
  });
  mockScheduleSave.mockClear(); // ignore any hydration-time noise
  return utils;
};

const setName = value =>
  fireEvent.change(screen.getByLabelText(/Insight Name/), { target: { value } });

describe('InsightEditForm — create mode', () => {
  test('renders empty defaults: scatter TracePropsEditor, no interactions, no delete', async () => {
    const onClose = jest.fn();
    await renderForm({ onClose });

    expect(screen.getByLabelText(/Insight Name/)).toHaveValue('');
    expect(screen.getByLabelText(/Insight Name/)).not.toBeDisabled();
    // The controlled props editor mounts with the default scatter props.
    expect(screen.getByTestId('trace-props-editor')).toBeInTheDocument();
    expect(screen.getByTestId('tpe-type')).toHaveTextContent('scatter');
    expect(screen.getByText(/No interactions defined/)).toBeInTheDocument();
    // No delete affordance in create mode.
    expect(screen.queryByTitle('Delete insight')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('passes ownerName from the name field (falls back to "insight")', async () => {
    await renderForm();
    // No name typed yet → fallback.
    expect(screen.getByTestId('trace-props-editor')).toHaveAttribute('data-owner', 'insight');
    setName('revenue');
    expect(screen.getByTestId('trace-props-editor')).toHaveAttribute('data-owner', 'revenue');
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

  test('blocks save when the props carry no type', async () => {
    const onSave = jest.fn();
    await renderForm({ onSave });
    setName('typeless');

    // The editor empties the props object (no `.type` discriminator).
    fireEvent.click(screen.getByTestId('tpe-clear-type'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Chart type is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('saves the full config payload: name, description, and props edited via TracePropsEditor', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    await renderForm({ onSave });

    setName('my_insight');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Revenue by day' },
    });
    // Editor flips type to bar (and supplies x) — flows into the controlled props.
    fireEvent.click(screen.getByTestId('tpe-set-bar'));
    expect(screen.getByTestId('tpe-type')).toHaveTextContent('bar');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [type, name, config] = onSave.mock.calls[0];
    expect(type).toBe('insight');
    expect(name).toBe('my_insight');
    expect(config).toEqual({
      name: 'my_insight',
      description: 'Revenue by day',
      props: { type: 'bar', x: ['a', 'b'] },
    });
    // Empty interactions/description must not pollute the YAML config.
    expect(config).not.toHaveProperty('interactions');
  });

  test('adding a prop via onChange is persisted under config.props (type preserved)', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    await renderForm({ onSave });
    setName('styled');

    fireEvent.click(screen.getByTestId('tpe-add-prop'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const config = onSave.mock.calls[0][2];
    expect(config.props).toEqual({ type: 'scatter', marker: { color: 'red' } });
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

  test('removing an interaction (edit mode) auto-saves the config without it', () => {
    // Edit mode → no Save button; removal debounces through scheduleSave.
    jest.useFakeTimers();
    renderEditHydrated(publishedInsight);

    // Remove the first (filter 'a > 1') interaction.
    fireEvent.click(screen.getAllByTitle('Remove interaction')[0]);
    expect(screen.queryByText('Interaction 4')).not.toBeInTheDocument();

    expect(mockScheduleSave).toHaveBeenCalled();
    const config = mockScheduleSave.mock.calls.at(-1)[0];
    // The empty fallback filter is dropped; the remaining kinds round-trip.
    expect(config.interactions).toEqual([{ split: 'b' }, { sort: 'c DESC' }]);

    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

describe('InsightEditForm — edit mode', () => {
  test('initializes from the insight config (name locked, props + interactions seeded)', async () => {
    render(
      <InsightEditForm
        insight={publishedInsight}
        isCreate={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );
    await screen.findByTestId('trace-props-editor');

    const nameInput = screen.getByLabelText(/Insight Name/);
    expect(nameInput).toHaveValue('rev');
    expect(nameInput).toBeDisabled();
    expect(screen.getByLabelText('Description')).toHaveValue('revenue insight');
    // The stored props (with their type) seed the controlled editor.
    expect(screen.getByTestId('tpe-type')).toHaveTextContent('bar');
    // Each stored interaction kind maps to its editor; the unknown `{}` entry
    // falls back to an empty filter.
    expect(screen.getAllByLabelText('Filter').map(t => t.value)).toEqual(['a > 1', '']);
    expect(screen.getByLabelText('Split')).toHaveValue('b');
    expect(screen.getByLabelText('Sort')).toHaveValue('c DESC');

    // Edit mode has no Save button — it auto-saves via the backbone.
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
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
    await screen.findByTestId('trace-props-editor');

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
    await screen.findByTestId('trace-props-editor');

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
    await screen.findByTestId('trace-props-editor');

    fireEvent.click(screen.getByTitle('Delete insight'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
    // Edit mode has no footer Cancel (auto-save indicator), so the only Cancel
    // is the confirmation's.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(deleteInsight).not.toHaveBeenCalled();
  });
});

describe('InsightEditForm — edit-mode auto-save (workspace rail)', () => {
  // The post-hydration guard uses setTimeout(0); fake timers make the
  // hydrate-then-edit sequencing deterministic.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('shows the SaveStateIndicator instead of a Save/Cancel footer', () => {
    renderEditHydrated();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    // No delete confirmation open → no Cancel button either.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('form-footer-autosave')).toBeInTheDocument();
    // Delete affordance stays available.
    expect(screen.getByTitle('Delete insight')).toBeInTheDocument();
  });

  test('does not schedule a save on hydration (only on a real edit)', () => {
    // renderEditHydrated clears scheduleSave after hydration; assert it stays
    // untouched until the user actually edits.
    renderEditHydrated();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });

  test('schedules the full round-tripped config on a field edit', () => {
    renderEditHydrated();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'updated' } });
    expect(mockScheduleSave).toHaveBeenCalledWith({
      name: 'rev',
      description: 'updated',
      props: { type: 'bar', x: 'ref(m).x', y: 'ref(m).y' },
      // The empty fallback interaction is dropped; the rest round-trip.
      interactions: [{ filter: 'a > 1' }, { split: 'b' }, { sort: 'c DESC' }],
    });
  });

  test('schedules the edited props into the config', () => {
    renderEditHydrated();
    fireEvent.click(screen.getByTestId('tpe-set-bar'));
    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({ props: { type: 'bar', x: ['a', 'b'] } })
    );
  });

  test('surfaces schema gate errors reported by the backbone', () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      status: 'invalid',
      errors: [{ path: 'props.type', message: 'must be a valid chart type' }],
      saveNow: jest.fn(),
      reset: jest.fn(),
    };
    renderEditHydrated();
    expect(screen.getByTestId('insight-gate-errors')).toHaveTextContent(
      'props.type: must be a valid chart type'
    );
  });
});

describe('InsightEditForm — embedded insights', () => {
  test('hides name/delete and navigates back to the parent', async () => {
    const onGoBack = jest.fn();
    render(
      <InsightEditForm
        insight={embeddedInsight}
        isCreate={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onGoBack={onGoBack}
      />
    );
    await screen.findByTestId('trace-props-editor');

    // Embedded insights have no name of their own and can't be deleted here.
    expect(screen.queryByLabelText(/Insight Name/)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete insight')).not.toBeInTheDocument();
    // Back navigation targets the parent object.
    const backButton = screen.getByRole('button', { name: /sales_chart/ });
    fireEvent.click(backButton);
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  test('auto-saves a nameless config on a field edit', () => {
    jest.useFakeTimers();
    renderEditHydrated(embeddedInsight);

    // Edit props via the editor stub — embedded edits still auto-save (no name
    // minimum), and the config never carries `name`.
    fireEvent.click(screen.getByTestId('tpe-set-bar'));

    expect(mockScheduleSave).toHaveBeenCalled();
    const config = mockScheduleSave.mock.calls.at(-1)[0];
    expect(config).toEqual({ props: { type: 'bar', x: ['a', 'b'] } });
    expect(config).not.toHaveProperty('name');

    jest.clearAllTimers();
    jest.useRealTimers();
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
    await screen.findByTestId('trace-props-editor');

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

  test('props edits flow into the preview payload', async () => {
    const setPreviewConfig = jest.fn();
    await renderForm({ setPreviewConfig });

    fireEvent.click(screen.getByTestId('tpe-set-bar'));
    await waitFor(() =>
      expect(setPreviewConfig.mock.calls.at(-1)[0].insightConfig.props).toEqual({
        type: 'bar',
        x: ['a', 'b'],
      })
    );
  });
});

describe('InsightEditForm blocks Save on invalid trace props (VIS-993)', () => {
  test('Save is held with an inline reason while TracePropsEditor reports invalid, and unblocks on valid', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    await renderForm({ onSave });
    setName('my_insight');

    fireEvent.click(screen.getByTestId('tpe-report-invalid'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/invalid trace propert/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('tpe-report-valid'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});
