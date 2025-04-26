import { useState, useCallback } from 'react';

export const useQueryDrawer = (db) => {
  const [customQuery, setCustomQuery] = useState("");
  const [showQueryDrawer, setShowQueryDrawer] = useState(false);

  const toggleQueryDrawer = useCallback((open) => () => {
    console.log("Toggling Query Drawer:", open);
    setShowQueryDrawer(open);
  }, []);

  const runCustomQuery = useCallback(async () => {
    if (!db) {
      console.error("DuckDB is not initialized.");
      return;
    }

    try {
      const conn = await db.connect();
      const result = await conn.query(customQuery);
      const data = await result.toArray();

      // Convert BigInt values for logging
      const bigIntReplacer = (key, value) => {
        if (typeof value === "bigint") return Number(value);
        if (typeof value === "string" && !isNaN(value)) return Number(value);
        return value;
      };

      console.log(
        "Query result (viewable):",
        JSON.stringify(data, bigIntReplacer, 2)
      );
      await conn.close();
    } catch (error) {
      console.error("Error executing query:", error);
    }
  }, [db, customQuery]);

  return {
    customQuery,
    setCustomQuery,
    showQueryDrawer,
    toggleQueryDrawer,
    runCustomQuery
  };
};