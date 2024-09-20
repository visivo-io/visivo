import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import Table from './Table';
import * as useTracesData from '../../hooks/useTracesData';
import { withProviders } from '../../utils/test-utils';

let table;

beforeEach(() => {
  table = {
    name: "name",
    props: { enable_column_dragging: true },
    column_defs: [
      {
        trace_name: "traceName",
        columns: [
          {
            header: "Widget Type",
            key: "columns.x_data",
          }
        ]
      }
    ],
    rows_per_page: 50,
    traces: [{ name: "traceName", columns: { x_data: "x" } }],
    selector: { name: "selector", type: "single", parent_name: "name" }
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

  //Have it return traces.
  render(<Table table={table} project={{ id: 1 }} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('Widget Type')).toBeInTheDocument();
  });
  expect(screen.getByText('value 1')).toBeInTheDocument();
  expect(screen.getByText('value 2')).toBeInTheDocument();
});

test('renders table when no data returned', async () => {
  const traceData = {
    "traceName": {}
  };
  jest.spyOn(useTracesData, 'useTracesData').mockImplementation((projectId, traceNames) => (traceData));

  render(<Table table={table} project={{ id: 1 }} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('No records to display')).toBeInTheDocument();
  });
});

test('exports table data as CSV when export button is clicked', async () => {
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

  global.URL.createObjectURL = jest.fn();
  global.Blob = jest.fn(() => ({ type: 'text/csv;charset=utf-8;' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'DownloadCsv' })).toBeInTheDocument();
  })
  const exportButton = screen.getByRole('button', { name: 'DownloadCsv' });
  fireEvent.click(exportButton);

  expect(global.Blob).toHaveBeenCalledWith([expect.any(String)], { type: 'text/csv;charset=utf-8;' });
  expect(global.URL.createObjectURL).toHaveBeenCalled();
});