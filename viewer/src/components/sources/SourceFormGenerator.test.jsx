import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourceFormGenerator from './SourceFormGenerator';
import useStore from '../../stores/store';

jest.mock('../../stores/store');

const mockStoreValues = {
  project: { project_json: { project_dir: '/test/project' } },
  projectFilePath: '/test/project/project.visivo.yml',
};

beforeEach(() => {
  useStore.mockImplementation(selector => selector(mockStoreValues));
});

afterEach(() => {
  jest.clearAllMocks();
  if (global.fetch && global.fetch.mockRestore) {
    global.fetch.mockRestore();
  }
});

describe('SourceFormGenerator file picker', () => {
  test('renders Browse button for SQLite database field', () => {
    render(<SourceFormGenerator sourceType="sqlite" values={{}} onChange={() => {}} />);

    const browseBtn = screen.getByTestId('file-picker-button-database');
    expect(browseBtn).toBeInTheDocument();
    expect(browseBtn).toHaveTextContent(/Browse/i);
  });

  test('renders Browse button for DuckDB database field', () => {
    render(<SourceFormGenerator sourceType="duckdb" values={{}} onChange={() => {}} />);

    const browseBtn = screen.getByTestId('file-picker-button-database');
    expect(browseBtn).toBeInTheDocument();
  });

  test('renders Browse button for CSV file field', () => {
    render(<SourceFormGenerator sourceType="csv" values={{}} onChange={() => {}} />);

    const browseBtn = screen.getByTestId('file-picker-button-file');
    expect(browseBtn).toBeInTheDocument();
  });

  test('does NOT render Browse button for plain text fields like postgres host', () => {
    render(<SourceFormGenerator sourceType="postgresql" values={{}} onChange={() => {}} />);

    expect(screen.queryByTestId('file-picker-button-host')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-picker-button-database')).not.toBeInTheDocument();
  });

  test('uploading a file POSTs to /api/source/upload-temp/ and updates the field', async () => {
    const onChange = jest.fn();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            absolute_path: '/test/project/data/mydb.db',
            filename: 'mydb.db',
            size_bytes: 16,
          }),
      })
    );

    render(<SourceFormGenerator sourceType="sqlite" values={{}} onChange={onChange} />);

    const fileInput = screen.getByTestId('file-picker-input-database');
    const file = new File(['SQLite format 3\x00'], 'mydb.db', {
      type: 'application/octet-stream',
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/source/upload-temp/',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // FormData should include both the file and the project_dir
    const callArgs = global.fetch.mock.calls[0];
    expect(callArgs[1].body).toBeInstanceOf(FormData);
    expect(callArgs[1].body.get('project_dir')).toBe('/test/project');
    expect(callArgs[1].body.get('file')).toBe(file);

    // Field should be updated with returned absolute path
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ database: '/test/project/data/mydb.db' });
    });
  });

  test('shows upload error when server returns 4xx', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = jest.fn();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad upload' }),
      })
    );

    render(<SourceFormGenerator sourceType="sqlite" values={{}} onChange={onChange} />);

    const fileInput = screen.getByTestId('file-picker-input-database');
    const file = new File(['oops'], 'bad.db');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error-database')).toHaveTextContent(/Bad upload/);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SourceFormGenerator CSV options', () => {
  test('CSV form shows delimiter, encoding, and has_header inputs', () => {
    render(
      <SourceFormGenerator
        sourceType="csv"
        values={{ file: '/abs/path.csv' }}
        onChange={() => {}}
      />
    );

    expect(screen.getByLabelText(/Delimiter/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Encoding/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/header row/i)).toBeInTheDocument();
  });

  test('CSV has_header defaults to checked', () => {
    render(<SourceFormGenerator sourceType="csv" values={{}} onChange={() => {}} />);

    const headerCheckbox = screen.getByLabelText(/header row/i);
    expect(headerCheckbox).toBeChecked();
  });

  test('Toggling has_header invokes onChange with boolean', () => {
    const onChange = jest.fn();
    render(<SourceFormGenerator sourceType="csv" values={{ has_header: true }} onChange={onChange} />);

    const headerCheckbox = screen.getByLabelText(/header row/i);
    fireEvent.click(headerCheckbox);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ has_header: false }));
  });

  test('Encoding select offers utf-8, utf-16, latin-1', () => {
    render(<SourceFormGenerator sourceType="csv" values={{}} onChange={() => {}} />);

    const encoding = screen.getByLabelText(/Encoding/i);
    const optionValues = within(encoding)
      .getAllByRole('option')
      .map(o => o.value);
    expect(optionValues).toEqual(expect.arrayContaining(['utf-8', 'utf-16', 'latin-1']));
  });
});
