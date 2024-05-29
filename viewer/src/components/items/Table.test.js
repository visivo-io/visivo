import { render, screen, waitFor } from '@testing-library/react';
import Table from './Table';
import * as useTracesData from '../../hooks/useTracesData';
import { withProviders } from '../../utils/test-utils';

let table;

beforeEach(() => {
  table = {
    name: "name",
    props: { enable_column_dragging: true },
    columns: [
      {
        header: "Widget Type",
        column: "x_data",
        enable_grouping: true
      }
    ],
    trace: { name: "traceName", columns: { x_data: "x" } }
  }
});

test('renders table', async () => {
  const traceData = {
    "traceName": {
      "cohortName": {
        "columns.x_data": [
          "value 1",
          "value 2",
        ]
      }
    }
  };
  jest.spyOn(useTracesData, 'useTracesData').mockImplementation((projectId, traceNames) => (traceData));

  render(<Table table={table} project={{ id: 1 }} />, { wrapper: withProviders });

  render(<Table table={table} project={{ id: 1 }} />);

  await waitFor(() => {
    expect(screen.getByText('Widget Type')).toBeInTheDocument();
  });
  expect(screen.getByText('value 1')).toBeInTheDocument();
  expect(screen.getByText('value 2')).toBeInTheDocument();
});
