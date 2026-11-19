/* eslint-disable no-template-curly-in-string -- literal ${ref(...)} strings under test */
/**
 * TablePreview tests (VIS-791 / N-2).
 *
 * The Track-N table preview reuses the EXISTING <Table> renderer, resolving the
 * saved table from the table store by name and classifying its data ref against
 * the model registry (the VIS-827 classification) so the right data hook loads
 * it. <Table> and the data hooks are mocked for a focused unit test.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import TablePreview from './TablePreview';
import useStore from '../../../stores/store';

const mockTableSpy = jest.fn();
jest.mock('../../items/Table', () => ({
  __esModule: true,
  default: props => {
    mockTableSpy(props);
    return <div data-testid="table-renderer-mock">{props.table?.name}</div>;
  },
}));

const mockUseModelsData = jest.fn();
const mockUseInsightsData = jest.fn();
jest.mock('../../../hooks/useModelsData', () => ({
  useModelsData: (...args) => mockUseModelsData(...args),
}));
jest.mock('../../../hooks/useInsightsData', () => ({
  useInsightsData: (...args) => mockUseInsightsData(...args),
}));
jest.mock('../../../hooks/useInputsData', () => ({
  useInputsData: jest.fn(),
}));
jest.mock('../../items/Input', () => ({
  __esModule: true,
  default: ({ input }) => <div data-testid="input-component">{input?.name}</div>,
}));

const seed = (
  tables = [],
  models = [],
  { inputs = [], insightJobs = {}, insights = [], insightsLoading = false } = {}
) => {
  act(() => {
    useStore.setState({
      tables,
      models,
      modelsLoading: false,
      insights,
      insightsLoading,
      fetchTables: jest.fn(),
      fetchModels: jest.fn(),
      fetchInsights: jest.fn(),
      inputs,
      fetchInputs: jest.fn(),
      insightJobs,
    });
  });
};

describe('TablePreview (VIS-791)', () => {
  beforeEach(() => {
    mockTableSpy.mockClear();
    mockUseModelsData.mockClear();
    mockUseInsightsData.mockClear();
  });

  test('renders the existing Table renderer for a saved table', () => {
    seed([{ name: 'orders', config: { data: '${ref(orders_model)}' } }], [{ name: 'orders_model' }]);
    render(<TablePreview activeObject={{ type: 'table', name: 'orders' }} projectId="p1" />);
    expect(screen.getByTestId('table-preview')).toBeInTheDocument();
    expect(screen.getByTestId('table-renderer-mock')).toHaveTextContent('orders');
  });

  test('classifies a model-backed data ref into the models data hook', () => {
    seed([{ name: 'orders', config: { data: '${ref(orders_model)}' } }], [{ name: 'orders_model' }]);
    render(<TablePreview activeObject={{ type: 'table', name: 'orders' }} projectId="p1" />);
    expect(mockUseModelsData).toHaveBeenCalledWith('p1', ['orders_model']);
    expect(mockUseInsightsData).toHaveBeenCalledWith('p1', []);
  });

  test('classifies an insight-backed data ref into the insights data hook', () => {
    seed([{ name: 't', config: { data: '${ref(sales_insight)}' } }], []);
    render(<TablePreview activeObject={{ type: 'table', name: 't' }} projectId="p1" />);
    expect(mockUseInsightsData).toHaveBeenCalledWith('p1', ['sales_insight']);
    expect(mockUseModelsData).toHaveBeenCalledWith('p1', []);
  });

  const pivotConfig = name => ({
    columns: [`\${ref(${name}).region}`],
    rows: [`\${ref(${name}).month}`],
    values: [`sum(\${ref(${name}).amount})`],
  });

  test('loads a pivot on a registered insight through the insights hook only (VIS-1701)', () => {
    seed([{ name: 'p', config: pivotConfig('revenue') }], [{ name: 'orders_model' }], {
      insights: [{ name: 'revenue' }],
    });
    render(<TablePreview activeObject={{ type: 'table', name: 'p' }} projectId="p1" />);
    expect(mockUseInsightsData).toHaveBeenLastCalledWith('p1', ['revenue']);
    expect(mockUseModelsData).toHaveBeenLastCalledWith('p1', []);
  });

  test('loads a pivot on a model through the models hook only', () => {
    seed([{ name: 'p', config: pivotConfig('orders_model') }], [{ name: 'orders_model' }]);
    render(<TablePreview activeObject={{ type: 'table', name: 'p' }} projectId="p1" />);
    expect(mockUseModelsData).toHaveBeenLastCalledWith('p1', ['orders_model']);
    expect(mockUseInsightsData).toHaveBeenLastCalledWith('p1', []);
  });

  test('holds an unlisted pivot ref while the insight registry loads', () => {
    seed([{ name: 'p', config: pivotConfig('unlisted') }], [{ name: 'orders_model' }], {
      insightsLoading: true,
    });
    render(<TablePreview activeObject={{ type: 'table', name: 'p' }} projectId="p1" />);
    expect(mockUseInsightsData).toHaveBeenLastCalledWith('p1', []);
    expect(mockUseModelsData).toHaveBeenLastCalledWith('p1', []);
  });

  test('fetches the insight registry when it is empty', () => {
    const fetchInsights = jest.fn();
    seed([{ name: 'p', config: pivotConfig('revenue') }], [{ name: 'orders_model' }]);
    act(() => {
      useStore.setState({ fetchInsights });
    });
    render(<TablePreview activeObject={{ type: 'table', name: 'p' }} projectId="p1" />);
    expect(fetchInsights).toHaveBeenCalled();
  });

  test('renders an empty state when the table is not found', () => {
    seed([], []);
    render(<TablePreview activeObject={{ type: 'table', name: 'missing' }} projectId="p1" />);
    expect(screen.getByTestId('table-preview-empty')).toHaveTextContent(/not found/i);
  });

  // VIS-1003: input-driven, insight-backed table renders its control widget(s)
  // (the hardcoded empty input list is replaced by the classified insightNames).
  test('renders input controls for an input-driven insight-backed table', () => {
    seed(
      [{ name: 't', config: { data: '${ref(sales_insight)}' } }],
      [],
      {
        inputs: [{ name: 'region', config: { name: 'region', type: 'single-select' } }],
        insightJobs: { sales_insight: { inputDependencies: ['region'], pendingInputs: null } },
      }
    );
    render(<TablePreview activeObject={{ type: 'table', name: 't' }} projectId="p1" />);

    expect(screen.getByTestId('input-controls-section')).toBeInTheDocument();
    expect(screen.getByTestId('input-component')).toHaveTextContent('region');
    expect(screen.getByTestId('table-renderer-mock')).toBeInTheDocument();
  });

  test('renders no control strip for a model-backed table with no inputs', () => {
    seed([{ name: 'orders', config: { data: '${ref(orders_model)}' } }], [{ name: 'orders_model' }]);
    render(<TablePreview activeObject={{ type: 'table', name: 'orders' }} projectId="p1" />);

    expect(screen.queryByTestId('input-controls-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('table-renderer-mock')).toBeInTheDocument();
  });
});
