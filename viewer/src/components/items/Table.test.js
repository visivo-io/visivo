import { render, screen, waitFor } from '@testing-library/react';
import Table from './Table';

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
  render(<Table table={table} traceData={traceData} />);

  await waitFor(() => {
    expect(screen.getByText('Widget Type')).toBeInTheDocument();
  });
  expect(screen.getByText('value 1')).toBeInTheDocument();
  expect(screen.getByText('value 2')).toBeInTheDocument();
});
