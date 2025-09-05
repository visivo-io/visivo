import React, { createContext, useContext, useEffect, useState } from 'react';
import { initDuckDB } from '../duckdb/duckdb';

const DuckDBContext = createContext(null);

export const DuckDBProvider = ({ children }) => {
  const [db, setDb] = useState(null);

  useEffect(() => {
    (async () => {
      const db = await initDuckDB();
      setDb(db);
    })();
  }, []);

  return <DuckDBContext.Provider value={db}>{children}</DuckDBContext.Provider>;
};

export const useDuckDB = () => {
  return useContext(DuckDBContext);
};
