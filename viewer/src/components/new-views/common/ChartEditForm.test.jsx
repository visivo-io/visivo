import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const mockFetchInsights = jest.fn();
const mockDeleteChart = jest.fn();
const mockCheckPublishStatus = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useStore.mockImplementation(selector => {
    const state = {
      deleteChart: mockDeleteChart,
      checkPublishStatus: mockCheckPublishStatus,
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

// The pill label is a <span>; the change-select repeats the name in an <option>,
// so scope text queries to the span to assert on the styled pill specifically.
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
    const select = screen.getByLabelText('Change insight 1');
    expect(select).toHaveValue('revenue_insight');
    fireEvent.change(select, { target: { value: 'cost_insight' } });
    const row = screen.getByTestId('ref-insight-row-0');
    expect(getPillLabel(row, 'cost_insight')).toBeInTheDocument();
  });
});
