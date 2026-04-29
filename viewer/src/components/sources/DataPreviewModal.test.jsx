import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataPreviewModal, { buildPreviewUrl } from './DataPreviewModal';

// Mock fetch
global.fetch = jest.fn();

describe('buildPreviewUrl', () => {
  it('builds a URL without schema', () => {
    expect(
      buildPreviewUrl({ source: 'src', database: 'db', table: 'users' })
    ).toBe('/api/project/sources/src/databases/db/tables/users/preview/?limit=100');
  });

  it('builds a URL with schema', () => {
    expect(
      buildPreviewUrl({
        source: 'src',
        database: 'db',
        table: 'users',
        schema: 'public',
      })
    ).toBe(
      '/api/project/sources/src/databases/db/schemas/public/tables/users/preview/?limit=100'
    );
  });

  it('encodes funky characters', () => {
    expect(
      buildPreviewUrl({ source: 'a/b', database: 'db', table: 'tbl' })
    ).toBe('/api/project/sources/a%2Fb/databases/db/tables/tbl/preview/?limit=100');
  });

  it('passes through a custom limit', () => {
    expect(
      buildPreviewUrl({ source: 's', database: 'd', table: 't', limit: 10 })
    ).toBe('/api/project/sources/s/databases/d/tables/t/preview/?limit=10');
  });
});

describe('DataPreviewModal', () => {
  const baseProps = {
    source: 'src',
    database: 'main',
    table: 'users',
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockReset();
  });

  it('shows loading state on mount', () => {
    fetch.mockImplementation(() => new Promise(() => {})); // never resolves

    render(<DataPreviewModal {...baseProps} />);

    expect(screen.getByTestId('preview-loading')).toBeInTheDocument();
    expect(screen.getByText(/users/)).toBeInTheDocument();
  });

  it('fetches from the no-schema URL when schema is null', () => {
    fetch.mockImplementation(() => new Promise(() => {}));

    render(<DataPreviewModal {...baseProps} />);

    expect(fetch).toHaveBeenCalledWith(
      '/api/project/sources/src/databases/main/tables/users/preview/?limit=100'
    );
  });

  it('fetches from the schema URL when schema is provided', () => {
    fetch.mockImplementation(() => new Promise(() => {}));

    render(<DataPreviewModal {...baseProps} schema="public" />);

    expect(fetch).toHaveBeenCalledWith(
      '/api/project/sources/src/databases/main/schemas/public/tables/users/preview/?limit=100'
    );
  });

  it('renders the heading with schema-qualified name when schema is provided', () => {
    fetch.mockImplementation(() => new Promise(() => {}));

    render(<DataPreviewModal {...baseProps} schema="public" />);

    expect(screen.getByText('public.users')).toBeInTheDocument();
  });

  it('renders rows after the fetch resolves', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        columns: [{ name: 'id', type: 'integer' }, { name: 'email', type: 'text' }],
        rows: [
          { id: 1, email: 'a@x.com' },
          { id: 2, email: 'b@x.com' },
        ],
        limit: 100,
        truncated: false,
      }),
    });

    render(<DataPreviewModal {...baseProps} />);

    await screen.findByTestId('preview-table');
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('a@x.com')).toBeInTheDocument();
    expect(screen.getByText('b@x.com')).toBeInTheDocument();
    expect(screen.getByTestId('preview-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('preview-row-1')).toBeInTheDocument();
  });

  it('renders truncated indicator when payload says so', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        columns: [{ name: 'id', type: 'integer' }],
        rows: [{ id: 1 }],
        limit: 100,
        truncated: true,
      }),
    });

    render(<DataPreviewModal {...baseProps} />);

    await screen.findByTestId('preview-table');
    expect(screen.getByText(/truncated/)).toBeInTheDocument();
  });

  it('renders empty-state when no rows are returned', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        columns: [{ name: 'id', type: 'integer' }],
        rows: [],
        limit: 100,
        truncated: false,
      }),
    });

    render(<DataPreviewModal {...baseProps} />);

    await screen.findByTestId('preview-empty');
  });

  it('renders an error message when fetch is non-ok', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'no such table' }),
    });

    render(<DataPreviewModal {...baseProps} />);

    const err = await screen.findByTestId('preview-error');
    expect(err).toHaveTextContent(/no such table/);
  });

  it('renders an error message when fetch rejects', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'));

    render(<DataPreviewModal {...baseProps} />);

    const err = await screen.findByTestId('preview-error');
    expect(err).toHaveTextContent(/network down/);
  });

  it('close button calls onClose', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    const onClose = jest.fn();

    render(<DataPreviewModal {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('preview-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the overlay calls onClose', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    const onClose = jest.fn();

    render(<DataPreviewModal {...baseProps} onClose={onClose} />);

    const overlay = screen.getByTestId('data-preview-modal');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the modal does not call onClose', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    const onClose = jest.fn();

    render(<DataPreviewModal {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('preview-loading'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pressing Escape calls onClose', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    const onClose = jest.fn();

    render(<DataPreviewModal {...baseProps} onClose={onClose} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles null/undefined cell values gracefully', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'text' }],
        rows: [
          { id: 1, name: null },
          { id: 2 }, // missing 'name'
        ],
        limit: 100,
        truncated: false,
      }),
    });

    render(<DataPreviewModal {...baseProps} />);

    await screen.findByTestId('preview-table');
    // Two rows rendered, no crashes
    expect(screen.getByTestId('preview-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('preview-row-1')).toBeInTheDocument();
  });

  it('serializes object cell values to JSON string', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        columns: [{ name: 'meta', type: 'json' }],
        rows: [{ meta: { a: 1 } }],
        limit: 100,
        truncated: false,
      }),
    });

    render(<DataPreviewModal {...baseProps} />);

    await screen.findByTestId('preview-table');
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });
});
