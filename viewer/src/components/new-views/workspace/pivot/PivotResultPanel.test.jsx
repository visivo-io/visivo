/**
 * PivotResultPanel (VIS-1008).
 *
 * Verifies the result pane drives the EXISTING pivot pipeline (`usePivotData`)
 * on the serialised draft config + the store-resolved sourceData, and renders
 * the pipeline's output through the shared `<DataTable>`. The pipeline + the
 * heavy DuckDB-backed DataTable are mocked (mirroring PivotableTable.test.jsx's
 * approach) so the test stays a focused unit.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import PivotResultPanel from './PivotResultPanel';
import useStore from '../../../../stores/store';
import { usePivotData } from '../../../../hooks/usePivotData';

jest.mock('../../../../hooks/usePivotData', () => ({
  usePivotData: jest.fn(),
}));

// DataTable is a heavy DuckDB/virtualised renderer; capture the props it gets
// and echo the columns/rows counts.
const dataTableProps = [];
jest.mock('../../../common/DataTable', () => ({
  __esModule: true,
  default: props => {
    dataTableProps.push(props);
    return (
      <div data-testid="data-table-mock">
        <span data-testid="data-table-colcount">{props.columns.length}</span>
        <span data-testid="data-table-rowcount">{props.rows.length}</span>
      </div>
    );
  },
}));

const PIVOT_RESULT = {
  rows: [{ a: 1 }, { a: 2 }],
  columns: [
    { id: 'region', accessorKey: 'region', header: 'Region', isPivotRow: true },
    { id: 'blue_sum', accessorKey: 'blue_sum', header: 'Blue' },
  ],
  nestedColumns: null,
  pivotMeta: { aggregationLabel: 'SUM of Revenue', pivotFieldName: 'Region', rowFieldNames: ['Category'] },
  isLoading: false,
  error: null,
};

const seedSource = name => {
  act(() => {
    useStore.setState({
      insightJobs: {
        [name]: { props_mapping: { 'props.region': 'h1' }, files: [{ name_hash: 'h' }] },
      },
      modelJobs: {},
    });
  });
};

describe('PivotResultPanel', () => {
  beforeEach(() => {
    usePivotData.mockReset();
    usePivotData.mockReturnValue(PIVOT_RESULT);
    dataTableProps.length = 0;
  });

  test('calls usePivotData with the draft config + the store-resolved sourceData', () => {
    seedSource('sales-insight');
    const config = {
      columns: ['${ref(sales-insight).region}'],
      rows: ['${ref(sales-insight).category}'],
      values: ['sum(${ref(sales-insight).revenue})'],
    };
    render(<PivotResultPanel config={config} sourceName="sales-insight" />);

    expect(usePivotData).toHaveBeenCalledTimes(1);
    const [passedConfig, passedSource] = usePivotData.mock.calls[0];
    expect(passedConfig).toEqual(config);
    expect(passedSource).toEqual({
      props_mapping: { 'props.region': 'h1' },
      files: [{ name_hash: 'h' }],
    });
  });

  test('renders the pipeline output through DataTable', () => {
    seedSource('sales-insight');
    render(
      <PivotResultPanel
        config={{ columns: ['${ref(sales-insight).region}'], rows: ['${ref(sales-insight).x}'], values: ['sum(${ref(sales-insight).r})'] }}
        sourceName="sales-insight"
      />
    );
    expect(screen.getByTestId('pivot-result')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-mock')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-colcount')).toHaveTextContent('2');
    expect(screen.getByTestId('data-table-rowcount')).toHaveTextContent('2');
  });

  test('passes the pivot metadata banner + sticky row columns to DataTable', () => {
    seedSource('sales-insight');
    render(
      <PivotResultPanel
        config={{ columns: ['${ref(sales-insight).region}'], rows: ['${ref(sales-insight).x}'], values: ['sum(${ref(sales-insight).r})'] }}
        sourceName="sales-insight"
      />
    );
    const [props] = dataTableProps;
    // The row-grouping column (isPivotRow) is stuck left.
    expect(props.stickyLeftColumns).toEqual(['region']);
    // The metadata banner is handed to DataTable as a node (rendered above headers).
    expect(props.headerBanner).toBeTruthy();
  });

  test('passes null config to the pipeline and shows the empty hint when columns are absent', () => {
    render(<PivotResultPanel config={null} sourceName="sales-insight" />);
    expect(usePivotData).toHaveBeenCalledWith(null, null);
    expect(screen.getByTestId('pivot-result-empty')).toBeInTheDocument();
  });

  test('surfaces a pipeline error', () => {
    usePivotData.mockReturnValue({ ...PIVOT_RESULT, error: 'boom' });
    seedSource('sales-insight');
    render(
      <PivotResultPanel
        config={{ columns: ['${ref(sales-insight).region}'], rows: ['${ref(sales-insight).x}'], values: ['sum(${ref(sales-insight).r})'] }}
        sourceName="sales-insight"
      />
    );
    expect(screen.getByTestId('pivot-result-error')).toHaveTextContent('boom');
  });
});
