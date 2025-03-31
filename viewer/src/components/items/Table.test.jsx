import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
            header: "Regular Column",
            key: "columns.regular_data"
          },
          {
            header: "Markdown Column",
            key: "columns.markdown_data",
            markdown: true
          }
        ]
      }
    ],
    rows_per_page: 50,
    traces: [{ name: "traceName", columns: { regular_data: "regular", markdown_data: "markdown" } }],
    selector: { name: "selector", type: "single", parent_name: "name" }
  }
});

test('renders table', async () => {
  const traceData = {
    "traceName": {
      "cohortName": {
        "columns.regular_data": [
          "plain text",
          "more plain text"
        ],
        "columns.markdown_data": [
          "**bold text**",
          "# heading"
        ]
      }
    }
  };
  jest.spyOn(useTracesData, 'useTracesData').mockImplementation((projectId, traceNames) => (traceData));

  //Have it return traces.
  render(<Table table={table} project={{ id: 1 }} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('Regular Column')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByText('**bold text**')).toBeInTheDocument();
  });
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
        "columns.regular_data": [
          "plain text",
          "more plain text"
        ],
        "columns.markdown_data": [
          "**bold text**",
          "# heading"
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
  });

  const exportButton = screen.getByRole('button', { name: 'DownloadCsv' });
  fireEvent.click(exportButton);

  expect(global.Blob).toHaveBeenCalledWith([expect.any(String)], { type: 'text/csv;charset=utf-8;' });
  expect(global.URL.createObjectURL).toHaveBeenCalled();
});

test('renders markdown formatted cells', async () => {
  const traceData = {
    "traceName": {
      "cohortName": {
        "columns.regular_data": [
          "plain text",
          "more plain text"
        ],
        "columns.markdown_data": [
          "**bold text**",
          "# heading"
        ]
      }
    }
  };

  jest.spyOn(useTracesData, 'useTracesData').mockImplementation(() => traceData);

  render(<Table table={table} project={{ id: 1 }} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('Regular Column')).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(screen.getByText('plain text')).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(screen.getByText('**bold text**')).toBeInTheDocument();
  });
});

test('handles non-string values in markdown cells', async () => {
  const traceData = {
    "traceName": {
      "cohortName": {
        "columns.markdown_data": [
          123,
          null,
          undefined
        ]
      }
    }
  };

  jest.spyOn(useTracesData, 'useTracesData').mockImplementation(() => traceData);

  render(<Table table={table} project={{ id: 1 }} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('123')).toBeInTheDocument();
  });
});

test('handles number values in cells', async () => {
  const traceData = {
    "traceName": {
      "cohortName": {
        "columns.regular_data": [
          123,
          12345678901234567,
          1234567890.123456
        ]
      }
    }
  };

  jest.spyOn(useTracesData, 'useTracesData').mockImplementation(() => traceData);

  render(<Table table={table} project={{ id: 1 }} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('123')).toBeInTheDocument();
  });
  expect(screen.getByText('12,345,678,901,234,568')).toBeInTheDocument();
  expect(screen.getByText('1,234,567,890.123')).toBeInTheDocument();
});