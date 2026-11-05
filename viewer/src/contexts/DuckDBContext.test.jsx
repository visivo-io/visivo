import React from 'react';
import { render, screen } from '@testing-library/react';
import { DuckDBProvider, useDuckDB } from './DuckDBContext';
import { initDuckDB } from '../duckdb/duckdb';

jest.mock('../duckdb/duckdb', () => ({
  initDuckDB: jest.fn(),
  closeConnection: jest.fn(),
}));

const Probe = () => {
  const db = useDuckDB();
  return <span>{db ? 'db ready' : 'no db'}</span>;
};

describe('DuckDBProvider', () => {
  it('provides the database once it starts', async () => {
    initDuckDB.mockResolvedValue({ id: 'db' });
    render(
      <DuckDBProvider>
        <Probe />
      </DuckDBProvider>
    );

    expect(await screen.findByText('db ready')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows why DuckDB could not start instead of leaving charts on a spinner', async () => {
    initDuckDB.mockRejectedValue(new Error('This browser cannot run DuckDB-WASM'));
    render(
      <DuckDBProvider>
        <Probe />
      </DuckDBProvider>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot run DuckDB-WASM'
    );
    expect(screen.getByText('no db')).toBeInTheDocument();
  });
});
