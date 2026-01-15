import React, { createContext, useContext, useEffect, useState } from 'react';
import { initDuckDB, closeConnection } from '../duckdb/duckdb';

const DuckDBContext = createContext(null);

export const DuckDBProvider = ({ children }) => {
  const [db, setDb] = useState(null);

  useEffect(() => {
    (async () => {
      const db = await initDuckDB();
      setDb(db);
    })();

    // Cleanup persistent connection on unmount
    return () => {
      closeConnection();
    };
  }, []);

  return <DuckDBContext.Provider value={db}>{children}</DuckDBContext.Provider>;
};

export const useDuckDB = () => useContext(DuckDBContext);
