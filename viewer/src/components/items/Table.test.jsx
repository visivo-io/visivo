import { render, screen, waitFor } from '@testing-library/react';
import Table from './Table';
import { withProviders } from '../../utils/test-utils';
import useStore from '../../stores/store';

jest.mock('./PivotableTable', () => ({ table, sourceData }) => (
  <div data-testid="pivotable-table">
    {sourceData?.data?.map((row, i) => (
      <div key={i}>{Object.values(row).join(', ')}</div>
    ))}
  </div>
));

let table;

beforeEach(() => {
  table = {
    name: 'name',
    data: 'ref(my-insight)',
    rows_per_page: 50,
  };
  useStore.setState({
    insightJobs: {
      'my-insight': {
        data: [
          { col_a: 'plain text', col_b: 100 },
          { col_a: 'more text', col_b: 200 },
        ],
      },
    },
    modelJobs: {},
  });
});

test('renders data-backed table via PivotableTable', async () => {
  render(<Table table={table} shouldLoad={true} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByTestId('pivotable-table')).toBeInTheDocument();
  });
  expect(screen.getByText('plain text, 100')).toBeInTheDocument();
});

test('shows loading when data not yet available', async () => {
  useStore.setState({
    insightJobs: {},
    modelJobs: {},
  });

  render(<Table table={table} shouldLoad={true} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('name')).toBeInTheDocument();
  });
});
