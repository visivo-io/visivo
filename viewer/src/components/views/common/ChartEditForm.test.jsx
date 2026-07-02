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
      insights: [{ name: 'revenue_insight' }, { name: 'cost_insight' }],
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
