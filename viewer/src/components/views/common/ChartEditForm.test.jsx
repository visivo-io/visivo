import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
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
// The layout editor is now rendered by ChartEditFormFields, which imports the
// SchemaEditor from './SchemaEditor/SchemaEditor' — mock THAT path.
jest.mock('./SchemaEditor/SchemaEditor', () => ({
  __esModule: true,
  SchemaEditor: ({ value, onChange }) => (
    <>
      <button type="button" data-testid="mock-schema-clear" onClick={() => onChange(undefined)}>
        clear layout
      </button>
      <button
        type="button"
        data-testid="mock-schema-touch"
        onClick={() => onChange({ ...(value || {}), showlegend: true })}
      >
        touch layout
      </button>
    </>
  ),
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
    expect(screen.getByText(/No insights yet/i)).toBeInTheDocument();
  });

  // VIS-1224: "+ Add Insight" opens the shared AddInsightMenu — pick an existing
  // project insight (added as a ref pill) or "New blank insight" (staged).
  test('the Add Insight menu adds an existing project insight as a ref pill', async () => {
    await renderForm();
    expect(screen.queryByTestId('ref-insight-row-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chart-add-insight'));
    // revenue_insight is already on the chart (excluded); cost_insight is offered.
    fireEvent.click(screen.getByTestId('add-insight-menu-existing-cost_insight'));
    expect(screen.getByTestId('ref-insight-row-1')).toBeInTheDocument();
  });

  test('the Add Insight menu "New blank insight" stages a blank embedded insight', async () => {
    await renderForm();
    expect(screen.queryByTestId('staged-insight-row-0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chart-add-insight'));
    fireEvent.click(screen.getByTestId('add-insight-menu-create-new'));
    expect(screen.getByTestId('staged-insight-row-0')).toBeInTheDocument();
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
    await screen.findByText(/No insights yet/i);
    expect(mockFetchInsights).toHaveBeenCalledTimes(1);

    // Each re-render delivers a new empty-array identity (an empty fetch
    // result) — the fetch must NOT re-fire (request loop).
    rerender(<ChartEditForm {...props} />);
    rerender(<ChartEditForm {...props} />);
    expect(mockFetchInsights).toHaveBeenCalledTimes(1);
  });
});

// VIS-1133: Save is disabled on an untouched edit-mode form, so tests that
// exercise the SAVE PATH must first make a real edit. It cannot be the name — a
// changed name in edit mode is a rename, which intercepts the save. The layout
// editor is the one config field the save-path assertions below don't pin, so
// it is what these tests touch; it only renders once a schema has resolved.
const withLayoutSchema = () =>
  jest.requireMock('../../../schemas/schemas').getSchema.mockResolvedValueOnce({ type: 'object' });

const makeDirty = async () => fireEvent.click(await screen.findByTestId('mock-schema-touch'));

describe('ChartEditForm — embedded insights on save', () => {
  const embeddedInsight = { name: 'inline_insight', props: { type: 'scatter' } };

  test('a chart whose insights are ALL embedded objects can still be saved', async () => {
    withLayoutSchema();
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

    await makeDirty();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('At least one insight is required')).not.toBeInTheDocument();
    const [, , config] = onSave.mock.calls[0];
    expect(config.insights).toEqual([embeddedInsight]);
  });

  test('saving preserves the original ref/embedded insight order', async () => {
    withLayoutSchema();
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

    await makeDirty();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, , config] = onSave.mock.calls[0];
    // Order drives trace layering/legend order — a save that never touched the
    // insight list must not rewrite [embedded, ref] as [ref, embedded].
    expect(config.insights).toEqual([embeddedInsight, 'ref(revenue_insight)']);
  });
});

describe('ChartEditForm — validation & save paths', () => {
  test('create mode blocks save without a name or any insight', async () => {
    const onSave = jest.fn();
    render(
      <ChartEditForm chart={null} isCreate onClose={jest.fn()} onSave={onSave} onNavigateToEmbedded={jest.fn()} />
    );
    await screen.findByText(/No insights yet/i);

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
    await screen.findByText(/No insights yet/i);

    fireEvent.change(screen.getByLabelText(/Chart Name/), { target: { value: 'new_chart' } });
    fireEvent.click(screen.getByTestId('chart-add-insight'));
    fireEvent.click(screen.getByTestId('add-insight-menu-existing-revenue_insight'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [objType, objName, config] = onSave.mock.calls[0];
    expect(objType).toBe('chart');
    expect(objName).toBe('new_chart');
    // A newly added ref (no original slot) is appended in ref(...) form.
    expect(config.insights).toEqual(['ref(revenue_insight)']);
  });

  test('non-empty layout values are carried into the saved config', async () => {
    withLayoutSchema();
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

    await makeDirty();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // The pre-existing title survives alongside the edit that dirtied the form.
    expect(onSave.mock.calls[0][2].layout).toEqual({
      title: { text: 'Revenue' },
      showlegend: true,
    });
  });

  test('a failed save surfaces the backend error and keeps the form open', async () => {
    withLayoutSchema();
    const onSave = jest.fn(async () => ({ success: false, error: 'chart save exploded' }));
    await renderForm({ onSave });

    await makeDirty();
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

// VIS-1224: the chart no longer edits insight props inline (the "Insight Props"
// picker + its embedded-inline edit path were removed). Each insight's props are
// edited in the insight's OWN edit panel — covered by InsightEditForm.test.jsx.

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
