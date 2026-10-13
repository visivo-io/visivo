import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Dashboard from '../Dashboard';
import useStore from '../../../stores/store';
import { useInsightsData } from '../../../hooks/useInsightsData';
import { useModelsData } from '../../../hooks/useModelsData';
import { useInputsData } from '../../../hooks/useInputsData';
import { UNSIZED_SLOT_HEIGHT } from './TemplateDashboard';

jest.mock('../../../stores/store');

let mockMeasured = { width: 640, height: 300 };
jest.mock('react-cool-dimensions', () => ({
  __esModule: true,
  default: (options = {}) => {
    if (options.onResize) options.onResize({ observe: jest.fn(), ...mockMeasured });
    return { observe: jest.fn(), ...mockMeasured };
  },
}));

jest.mock('../../../hooks/useInsightsData', () => ({ useInsightsData: jest.fn() }));
jest.mock('../../../hooks/useModelsData', () => ({ useModelsData: jest.fn() }));
jest.mock('../../../hooks/useInputsData', () => ({ useInputsData: jest.fn() }));
jest.mock('../../../hooks/useVisibleRows', () => ({
  useVisibleRows: jest.fn(() => ({ visibleRows: new Set([0]), setRowRef: jest.fn() })),
}));

jest.mock('../../items/Chart', () => ({
  __esModule: true,
  default: ({ chart, width, height }) => (
    <div data-testid="chart" data-width={width} data-height={height}>
      {chart.name}
    </div>
  ),
}));
jest.mock('../../items/Table', () => ({
  __esModule: true,
  default: ({ table }) => <div data-testid="table">{table.name}</div>,
}));
jest.mock('../../items/Markdown', () => ({
  __esModule: true,
  default: ({ markdown }) => <div data-testid="markdown">{markdown.name}</div>,
}));
jest.mock('../../items/Input', () => ({
  __esModule: true,
  default: ({ input }) => <div data-testid="input">{input.name}</div>,
}));

const TEMPLATE = `
  <style>.kpi { height: 160px; }</style>
  <section class="banner">
    <div class="kpi" data-visivo-item="revenue"></div>
    <div class="kpi" data-visivo-item="notes"></div>
  </section>
  <article><p>Revenue held through the quarter.</p><div data-visivo-item="region"></div></article>
  <div data-visivo-item="ghost"></div>
  <script>window.__templateRan = true</script>
`;

const objects = {
  // eslint-disable-next-line no-template-curly-in-string
  revenue: { name: 'revenue', config: { name: 'revenue', insights: ['${ref(revenue-insight)}'] } },
  notes: { name: 'notes', config: { name: 'notes', content: '# Notes' } },
  region: { name: 'region', config: { name: 'region', type: 'single-select' } },
};

const renderTemplateDashboard = (template = TEMPLATE) => {
  useStore.mockImplementation(selector =>
    selector({
      project: { id: 'p1' },
      dashboards: [{ name: 'review', config: { name: 'review', type: 'template', template } }],
      fetchCharts: jest.fn(),
      fetchTables: jest.fn(),
      fetchMarkdowns: jest.fn(),
      fetchInputs: jest.fn(),
      fetchModels: jest.fn(),
      charts: [],
      tables: [],
      markdowns: [],
      inputs: [],
      models: [],
      getChartByName: name => (name === 'revenue' ? objects.revenue : null),
      getTableByName: () => null,
      getMarkdownByName: name => (name === 'notes' ? objects.notes : null),
      getInputByName: name => (name === 'region' ? objects.region : null),
    })
  );
  return render(<Dashboard projectId="p1" dashboardName="review" />);
};

describe('template dashboards', () => {
  beforeEach(() => {
    mockMeasured = { width: 640, height: 300 };
    jest.clearAllMocks();
  });

  it('renders the sanitised template in a shadow root with a slot per item', () => {
    renderTemplateDashboard();

    const shadow = screen.getByTestId('template-dashboard-host').shadowRoot;
    expect(shadow).not.toBeNull();
    expect(within(shadow).getByText('Revenue held through the quarter.')).toBeInTheDocument();
    expect(shadow.innerHTML).not.toContain('<script');
    expect(window.__templateRan).toBeUndefined();
    const slotNames = [...shadow.innerHTML.matchAll(/<slot name="([^"]+)"/g)].map(match => match[1]);
    expect(slotNames).toEqual(['visivo-slot-0', 'visivo-slot-1', 'visivo-slot-2', 'visivo-slot-3']);
  });

  it('projects each item into its slot, resolving the name to its type', () => {
    renderTemplateDashboard();

    expect(screen.getByTestId('template-slot-visivo-slot-0')).toHaveAttribute('slot', 'visivo-slot-0');
    expect(screen.getByTestId('template-slot-visivo-slot-0')).toContainElement(screen.getByTestId('chart'));
    expect(screen.getByTestId('template-slot-visivo-slot-1')).toContainElement(screen.getByTestId('markdown'));
    expect(screen.getByTestId('template-slot-visivo-slot-2')).toContainElement(screen.getByTestId('input'));
    expect(screen.getByTestId('template-slot-visivo-slot-3')).toHaveTextContent('Not found: ghost');
  });

  it('sizes each item to the box the template gives its slot', () => {
    renderTemplateDashboard();

    const chart = screen.getByTestId('chart');
    expect(chart).toHaveAttribute('data-width', '640');
    expect(chart).toHaveAttribute('data-height', String(300 - 8));
  });

  it('falls back to a default height for a slot the template left unsized', () => {
    mockMeasured = { width: 640, height: 0 };
    renderTemplateDashboard();

    expect(screen.getByTestId('template-slot-visivo-slot-0')).toHaveStyle({
      height: `${UNSIZED_SLOT_HEIGHT}px`,
    });
  });

  it('prefetches data for the items its slots name', () => {
    renderTemplateDashboard();

    expect(useInsightsData).toHaveBeenLastCalledWith('p1', ['revenue-insight'], undefined, expect.anything());
    expect(useInputsData).toHaveBeenLastCalledWith('p1', ['region'], expect.anything());
    expect(useModelsData).toHaveBeenLastCalledWith('p1', [], undefined, expect.anything());
  });

  it('contains the template so fixed positioning cannot escape the dashboard', () => {
    renderTemplateDashboard();

    expect(screen.getByTestId('dashboard_review')).toHaveStyle({ contain: 'layout' });
  });
});
