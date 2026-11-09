import React, { createContext, useContext, useEffect, useState } from 'react';
import { initDuckDB, closeConnection } from '../duckdb/duckdb';

const DuckDBContext = createContext(null);

export const DuckDBProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    initDuckDB().then(
      instance => {
        if (!cancelled) setDb(instance);
      },
      err => {
        if (!cancelled) setError(err);
      }
    );

    // Cleanup persistent connection on unmount
    return () => {
      cancelled = true;
      closeConnection();
    };
  }, []);

  return (
    <DuckDBContext.Provider value={db}>
      {error && (
        <div
          role="alert"
          className="border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {error.message}
        </div>
      )}
      {children}
    </DuckDBContext.Provider>
  );
};

export const useDuckDB = () => useContext(DuckDBContext);
