import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import selectEvent from 'react-select-event';
import ChartEditForm from './ChartEditForm';
import useStore from '../../../stores/store';

jest.mock('../../../stores/store', () => {
  const fn = jest.fn();
  fn.ObjectStatus = { NEW: 'new' };
  return { __esModule: true, default: fn, ObjectStatus: { NEW: 'new' } };
});

// Layout schema loading is async + irrelevant to the insight pill behavior.
jest.mock('../../../schemas/schemas', () => ({
  getSchema: jest.fn().mockResolvedValue(null),
  isSchemaLoaded: jest.fn().mockReturnValue(true),
}));

// Stand-in SchemaEditor exposing the "remove the last layout property" path:
// the real editor emits `undefined` (cleanEmptyObjects) when it empties out.
jest.mock('./SchemaEditor', () => ({
  __esModule: true,
  SchemaEditor: ({ onChange }) => (
    <button type="button" data-testid="mock-schema-clear" onClick={() => onChange(undefined)}>
      clear layout
    </button>
  ),
}));

// TracePropsEditor stub: echo ownerName + props.type, and expose a button that
// drives onChange so we can assert the parent persists the edited props.
jest.mock('./TracePropsEditor', () => ({
  __esModule: true,
  default: ({ ownerName, props, onChange }) => (
    <div data-testid="trace-props-editor" data-owner={ownerName}>
      <span data-testid="tpe-type">{props?.type}</span>
      <button
        type="button"
        data-testid="tpe-add-prop"
        onClick={() => onChange({ ...props, marker: { color: 'red' } })}
      >
        add prop
      </button>
    </div>
  ),
}));

// useRecordSave stub: capture (type, name) per instance + expose scheduleSave so
// we can assert the selected insight record is persisted through the backbone.
const mockScheduleSave = jest.fn();
const mockUseRecordSave = jest.fn(() => ({
  status: 'idle',
  scheduleSave: mockScheduleSave,
  saveNow: jest.fn(),
  reset: jest.fn(),
}));
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: (...args) => mockUseRecordSave(...args),
}));

const mockFetchInsights = jest.fn();
const mockDeleteChart = jest.fn();
const mockCheckPublishStatus = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useStore.mockImplementation(selector => {
    const state = {
      deleteChart: mockDeleteChart,
      checkCommitStatus: mockCheckPublishStatus,
      fetchInsights: mockFetchInsights,
      insights: [
        { name: 'revenue_insight', config: { props: { type: 'bar', x: ['q1'] } } },
        { name: 'cost_insight', config: { props: { type: 'scatter' } } },
      ],
    };
    return typeof selector === 'function' ? selector(state) : state;
  });
});

const chartWithRefInsight = {
  name: 'rev_chart',
  status: 'published',
  config: {
    insights: ['ref(revenue_insight)'],
    layout: {},
  },
};

// Renders and flushes the async layout-schema effect (await a findBy* query) so
// no act() warnings leak from the schema load resolving after the initial render.
const renderForm = async (props = {}) => {
  const utils = render(
    <ChartEditForm
      chart={chartWithRefInsight}
      isCreate={false}
      onClose={jest.fn()}
      onSave={jest.fn()}
      onNavigateToEmbedded={jest.fn()}
      {...props}
    />
  );
  await screen.findByTestId('ref-insight-row-0');
  return utils;
};

// The pill label is a <span>; the change-select (brand <Select>) may repeat the
// name in its value/option text, so scope text queries to the span to assert on
// the styled pill specifically.
const getPillLabel = (row, name) =>
  within(row)
    .getAllByText(name)
    .find(el => el.tagName === 'SPAN');

describe('ChartEditForm — ref insight pills', () => {
  test('renders a selected ref insight as a styled insight pill (not a bare select)', async () => {
    await renderForm();

    const row = screen.getByTestId('ref-insight-row-0');
    const label = getPillLabel(row, 'revenue_insight');
    expect(label).toBeInTheDocument();
    // Uses the shared insight type color (purple-800) from objectTypeConfigs.
    expect(label.className).toContain('text-purple-800');

    // The pill carries the insight type icon (svg) and a remove affordance.
    expect(within(row).getByTestId('pill-remove')).toBeInTheDocument();
  });

  test('the pill exposes a working remove (x) that drops the insight', async () => {
    await renderForm();

    expect(screen.getByTestId('ref-insight-row-0')).toBeInTheDocument();
    const removeBtn = within(screen.getByTestId('ref-insight-row-0')).getByTestId('pill-remove');
    fireEvent.click(removeBtn);

    expect(screen.queryByTestId('ref-insight-row-0')).not.toBeInTheDocument();
    expect(screen.getByText(/No insights added/i)).toBeInTheDocument();
  });

  test('Add Insight appends another ref insight pill', async () => {
    await renderForm();
    expect(screen.queryByTestId('ref-insight-row-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Insight'));
    expect(screen.getByTestId('ref-insight-row-1')).toBeInTheDocument();
  });

  test('the change-select still lets you swap which insight is referenced', async () => {
    await renderForm();
    const select = screen.getByTestId('change-insight-select-0');
    // The brand <Select> shows the current ref as its selected value.
    expect(select).toHaveTextContent('revenue_insight');
    await selectEvent.select(within(select).getByRole('combobox'), 'cost_insight', {
      container: document.body,
    });
    const row = screen.getByTestId('ref-insight-row-0');
    expect(getPillLabel(row, 'cost_insight')).toBeInTheDocument();
  });
});

describe('ChartEditForm — insight fetch guard', () => {
  test('fetches insights only once when the project has zero insights', async () => {
    // Mirror the store slice: every render hands back a FRESH empty array
    // (fetchInsights always does `set({ insights: data.insights || [] })`).
    useStore.mockImplementation(selector => {
      const state = {
        deleteChart: mockDeleteChart,
        checkCommitStatus: mockCheckPublishStatus,
        fetchInsights: mockFetchInsights,
        insights: [],
      };
      return typeof selector === 'function' ? selector(state) : state;
    });
    const props = {
      chart: null,
      isCreate: true,
      onClose: jest.fn(),
      onSave: jest.fn(),
      onNavigateToEmbedded: jest.fn(),
    };
    const { rerender } = render(<ChartEditForm {...props} />);
    await screen.findByText(/No insights available/i);
    expect(mockFetchInsights).toHaveBeenCalledTimes(1);

    // Each re-render delivers a new empty-array identity (an empty fetch
    // result) — the fetch must NOT re-fire (request loop).
    rerender(<ChartEditForm {...props} />);
    rerender(<ChartEditForm {...props} />);
    expect(mockFetchInsights).toHaveBeenCalledTimes(1);
  });
});

describe('ChartEditForm — embedded insights on save', () => {
  const embeddedInsight = { name: 'inline_insight', props: { type: 'scatter' } };

  test('a chart whose insights are ALL embedded objects can still be saved', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <ChartEditForm
        chart={{ name: 'embed_chart', status: 'published', config: { insights: [embeddedInsight] } }}
        isCreate={false}
        onClose={jest.fn()}
        onSave={onSave}
        onNavigateToEmbedded={jest.fn()}
      />
    );
    await screen.findByText('Embedded Insights');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('At least one insight is required')).not.toBeInTheDocument();
    const [, , config] = onSave.mock.calls[0];
    expect(config.insights).toEqual([embeddedInsight]);
  });

  test('saving preserves the original ref/embedded insight order', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <ChartEditForm
        chart={{
          name: 'mixed_chart',
          status: 'published',
          config: { insights: [embeddedInsight, 'ref(revenue_insight)'] },
        }}
        isCreate={false}
        onClose={jest.fn()}
        onSave={onSave}
        onNavigateToEmbedded={jest.fn()}
      />
    );
    await screen.findByTestId('ref-insight-row-0');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, , config] = onSave.mock.calls[0];
    // Order drives trace layering/legend order — an untouched save must not
    // rewrite [embedded, ref] as [ref, embedded].
    expect(config.insights).toEqual([embeddedInsight, 'ref(revenue_insight)']);
  });
});

describe('ChartEditForm — validation & save paths', () => {
  test('create mode blocks save without a name or any insight', async () => {
    const onSave = jest.fn();
    render(
      <ChartEditForm chart={null} isCreate onClose={jest.fn()} onSave={onSave} onNavigateToEmbedded={jest.fn()} />
    );
    await screen.findByText(/No insights added/i);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('At least one insight is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('create mode: typed name and newly added ref insight land in the save call', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <ChartEditForm chart={null} isCreate onClose={jest.fn()} onSave={onSave} onNavigateToEmbedded={jest.fn()} />
    );
    await screen.findByText(/No insights added/i);

    fireEvent.change(screen.getByLabelText(/Chart Name/), { target: { value: 'new_chart' } });
    fireEvent.click(screen.getByText('Add Insight'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [objType, objName, config] = onSave.mock.calls[0];
    expect(objType).toBe('chart');
    expect(objName).toBe('new_chart');
    // A newly added ref (no original slot) is appended in ref(...) form.
    expect(config.insights).toEqual(['ref(revenue_insight)']);
  });

  test('non-empty layout values are carried into the saved config', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    render(
      <ChartEditForm
        chart={{
          name: 'rev_chart',
          status: 'published',
          config: { insights: ['ref(revenue_insight)'], layout: { title: { text: 'Revenue' } } },
        }}
        isCreate={false}
        onClose={jest.fn()}
        onSave={onSave}
        onNavigateToEmbedded={jest.fn()}
      />
    );
    await screen.findByTestId('ref-insight-row-0');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][2].layout).toEqual({ title: { text: 'Revenue' } });
  });

  test('a failed save surfaces the backend error and keeps the form open', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'chart save exploded' }));
    await renderForm({ onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('chart save exploded')).toBeInTheDocument();
    // Save recovered to its idle label so the user can retry.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('ChartEditForm — delete flows', () => {
  test('confirm delete removes the chart, refreshes commit status, and closes', async () => {
    mockDeleteChart.mockResolvedValueOnce({ success: true });
    const onClose = jest.fn();
    await renderForm({ onClose });

    fireEvent.click(screen.getByTitle('Delete chart'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() => expect(mockDeleteChart).toHaveBeenCalledWith('rev_chart'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCheckPublishStatus).toHaveBeenCalled();
  });

  test('a NEW chart warns about discarding unsaved changes instead', async () => {
    await renderForm({ chart: { ...chartWithRefInsight, status: 'new' } });
    fireEvent.click(screen.getByTitle('Delete chart'));
    expect(screen.getByText(/discard your unsaved changes/i)).toBeInTheDocument();
  });

  test('a failed delete surfaces the error and dismisses the confirm without closing', async () => {
    mockDeleteChart.mockResolvedValueOnce({ success: false, error: 'chart is referenced' });
    const onClose = jest.fn();
    await renderForm({ onClose });

    fireEvent.click(screen.getByTitle('Delete chart'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('chart is referenced')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockCheckPublishStatus).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('cancel dismisses the confirmation without deleting', async () => {
    await renderForm();
    fireEvent.click(screen.getByTitle('Delete chart'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();
    // The confirm box renders above the footer actions, so its Cancel comes first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(screen.queryByText(/mark it for deletion/i)).not.toBeInTheDocument();
    expect(mockDeleteChart).not.toHaveBeenCalled();
    // The delete affordance returns once the confirm is dismissed.
    expect(screen.getByTitle('Delete chart')).toBeInTheDocument();
  });
});

describe('ChartEditForm — embedded insight navigation', () => {
  const embeddedInsight = { name: 'inline_insight', props: { type: 'scatter' } };

  test('clicking an embedded insight navigates with a synthetic insight and applyToParent', async () => {
    const onNavigateToEmbedded = jest.fn();
    render(
      <ChartEditForm
        chart={{ name: 'embed_chart', status: 'published', config: { insights: [embeddedInsight] } }}
        isCreate={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onNavigateToEmbedded={onNavigateToEmbedded}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /Insight: inline_insight/ }));

    expect(onNavigateToEmbedded).toHaveBeenCalledTimes(1);
    const [type, synthetic, opts] = onNavigateToEmbedded.mock.calls[0];
    expect(type).toBe('insight');
    expect(synthetic.name).toBe('inline_insight');
    expect(synthetic.config).toEqual(embeddedInsight);
    expect(synthetic._embedded).toEqual({
      parentType: 'chart',
      parentName: 'embed_chart',
      path: 'insights[0]',
    });
    // applyToParent writes the edited insight back into the chart's insights slot.
    const edited = { name: 'inline_insight', props: { type: 'bar' } };
    const updated = opts.applyToParent(
      { name: 'embed_chart', insights: [embeddedInsight] },
      edited
    );
    expect(updated.insights).toEqual([edited]);
  });

  test('an unnamed embedded insight gets a synthetic placeholder name', async () => {
    const onNavigateToEmbedded = jest.fn();
    render(
      <ChartEditForm
        chart={{ name: 'embed_chart', status: 'published', config: { insights: [{ props: { type: 'scatter' } }] } }}
        isCreate={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onNavigateToEmbedded={onNavigateToEmbedded}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /Insight: 1/ }));

    expect(onNavigateToEmbedded.mock.calls[0][1].name).toBe('(embedded insight 1)');
  });
});

describe('ChartEditForm — insight props editor (TracePropsEditor)', () => {
  test("default-selects the chart's only insight and renders TracePropsEditor for it", async () => {
    await renderForm();

    // The lone ref insight (revenue_insight) is auto-selected → editor mounts.
    const editor = screen.getByTestId('trace-props-editor');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute('data-owner', 'revenue_insight');
    // Props are seeded from that insight record's config.props.
    expect(screen.getByTestId('tpe-type')).toHaveTextContent('bar');
  });

  test('selecting a different insight renders TracePropsEditor for that insight', async () => {
    await renderForm();
    // Add a second insight ref so the picker has a choice.
    fireEvent.click(screen.getByText('Add Insight'));
    expect(screen.getByTestId('ref-insight-row-1')).toBeInTheDocument();

    const select = screen.getByTestId('insight-props-select');
    await selectEvent.select(within(select).getByRole('combobox'), 'cost_insight', {
      container: document.body,
    });

    const editor = screen.getByTestId('trace-props-editor');
    expect(editor).toHaveAttribute('data-owner', 'cost_insight');
    expect(screen.getByTestId('tpe-type')).toHaveTextContent('scatter');
  });

  test("editing props persists via useRecordSave('insight', selectedName)", async () => {
    await renderForm();

    // The hook is instantiated for the selected ref insight.
    expect(mockUseRecordSave).toHaveBeenCalledWith('insight', 'revenue_insight');

    fireEvent.click(screen.getByTestId('tpe-add-prop'));

    // The whole insight record config is written back with the edited props,
    // through the unified backbone — not the chart save path.
    expect(mockScheduleSave).toHaveBeenCalledWith({
      props: { type: 'bar', x: ['q1'], marker: { color: 'red' } },
    });
  });

  test('an embedded insight edits inline and persists the CHART via onSave', async () => {
    const onSave = jest.fn(() => Promise.resolve({ success: true }));
    const chartWithEmbedded = {
      name: 'rev_chart',
      status: 'published',
      config: {
        insights: [{ name: 'inline_one', props: { type: 'bar' } }],
        layout: {},
      },
    };
    render(
      <ChartEditForm
        chart={chartWithEmbedded}
        isCreate={false}
        onClose={jest.fn()}
        onSave={onSave}
        onNavigateToEmbedded={jest.fn()}
      />
    );
    await screen.findByTestId('trace-props-editor');

    // The lone embedded insight is auto-selected; the editor seeds from its props.
    expect(screen.getByTestId('tpe-type')).toHaveTextContent('bar');

    fireEvent.click(screen.getByTestId('tpe-add-prop'));

    // Embedded insight is edited inline; the CHART (not an insight record) saves.
    expect(mockScheduleSave).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith('chart', 'rev_chart', {
      name: 'rev_chart',
      insights: [{ name: 'inline_one', props: { type: 'bar', marker: { color: 'red' } } }],
    });
  });
});

describe('ChartEditForm — layout schema load failure', () => {
  test('shows the schema error when the layout schema cannot load', async () => {
    const { getSchema, isSchemaLoaded } = jest.requireMock('../../../schemas/schemas');
    isSchemaLoaded.mockReturnValueOnce(false);
    getSchema.mockRejectedValueOnce(new Error('schema fetch boom'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await renderForm();
      expect(await screen.findByText('Failed to load layout schema')).toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('ChartEditForm — layout emptied to undefined', () => {
  test('Save still completes after the layout editor empties to undefined', async () => {
    const { getSchema } = jest.requireMock('../../../schemas/schemas');
    getSchema.mockResolvedValueOnce({ type: 'object' });
    const onSave = jest.fn(async () => ({ success: true }));
    await renderForm({ onSave });

    // Remove the last layout property — the SchemaEditor emits `undefined`.
    fireEvent.click(await screen.findByTestId('mock-schema-clear'));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, , config] = onSave.mock.calls[0];
    expect(config.layout).toBeUndefined();
    // The button recovered to its idle label (not stuck on 'Saving...').
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
