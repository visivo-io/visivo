/**
 * useSourceErdDag — flattens a source's introspection metadata into React-Flow
 * ERD nodes (VIS-1005).
 *
 * The `sourcesMetadata` feed nests db → schema → table → column (see
 * useSourceOutline's `normalizeNested`). The ERD shows ONE node per TABLE, so we
 * flatten every table across all databases/schemas into a flat node list. Each
 * node carries its qualified-name parts (`database`, `schema`, `table`) plus the
 * column list so `TableErdNode` can render the column rows and `ErdTableContextMenu`
 * can build a `SELECT * FROM <schema>.<table>`.
 *
 * Foreign keys (introspected per table, VIS-1014) become relationship edges
 * between table nodes whose referenced table is also in this source's ERD.
 *
 * This is a PURE builder over the metadata entry — no store reads, no fetches —
 * so SourceErd owns the fetch lifecycle and this stays trivially testable.
 */

/** Stable node id for a flattened table. Disjoint from the lineage `source-…` ids. */
export const erdNodeId = (database, schema, table) =>
  ['source-erd', database, schema, table].filter(v => v != null).join('::');

/**
 * Normalise one column entry into `{ name, type }`. Nested-feed columns are bare
 * strings (no type); the flat schema-jobs feed yields `{ name, type }` objects.
 */
const normalizeColumn = col => {
  if (typeof col === 'string') return { name: col, type: null };
  return { name: col?.name ?? null, type: col?.type ?? null };
};

/**
 * Flatten one source metadata entry (the `sources[]` element from
 * `fetchSourceMetadata`) into a flat list of table descriptors.
 *
 * @returns {Array<{ id, database, schema, table, columns: Array<{name,type}> }>}
 */
export function flattenSourceTables(entry) {
  if (!entry) return [];
  const databases = Array.isArray(entry.databases) ? entry.databases : [];
  const out = [];

  databases.forEach(db => {
    const dbName = db?.name ?? null;

    const pushTable = (table, schemaName) => {
      if (!table || table.name == null) return;
      const columns = Array.isArray(table.columns) ? table.columns.map(normalizeColumn) : [];
      out.push({
        id: erdNodeId(dbName, schemaName, table.name),
        database: dbName,
        schema: schemaName,
        table: table.name,
        columns,
        foreignKeys: Array.isArray(table.foreign_keys) ? table.foreign_keys : [],
      });
    };

    if (Array.isArray(db?.schemas)) {
      db.schemas.forEach(schema => {
        const schemaName = schema?.name ?? null;
        (Array.isArray(schema?.tables) ? schema.tables : []).forEach(t => pushTable(t, schemaName));
      });
    }
    // Tables can also hang directly off the database (no schema layer).
    (Array.isArray(db?.tables) ? db.tables : []).forEach(t => pushTable(t, null));
  });

  return out;
}

/**
 * Build React-Flow ERD nodes (+ empty edges) for a source's flattened tables.
 *
 * @param {string} sourceName  — the source the ERD belongs to (for ${ref()} construction downstream)
 * @param {object|null} entry  — the `sources[]` metadata entry for this source
 * @returns {{ nodes: Array, edges: Array }}
 */
export function useSourceErdDag(sourceName, entry) {
  const tables = flattenSourceTables(entry);

  const nodes = tables.map(t => ({
    id: t.id,
    type: 'tableErdNode',
    // Position is overwritten by computeLayout in SourceErd.
    position: { x: 0, y: 0 },
    data: {
      sourceName,
      objectType: 'source',
      database: t.database,
      schema: t.schema,
      table: t.table,
      name: t.table,
      columns: t.columns,
    },
  }));

  // VIS-1014: a relationship edge per foreign key whose referenced table is also
  // diagrammed in this source. The FK's first column pair drives the handles.
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = [];
  tables.forEach(t => {
    (t.foreignKeys || []).forEach((fk, i) => {
      if (!fk || fk.references_table == null) return;
      const targetId = erdNodeId(t.database, fk.references_schema ?? t.schema, fk.references_table);
      if (!nodeIds.has(targetId) || targetId === t.id) return;
      edges.push({
        id: `${t.id}::fk::${i}::${targetId}`,
        source: t.id,
        target: targetId,
        sourceHandle: (fk.columns && fk.columns[0]) || null,
        targetHandle: (fk.references_columns && fk.references_columns[0]) || null,
        type: 'smoothstep',
        data: { columns: fk.columns || [], referencesColumns: fk.references_columns || [] },
      });
    });
  });

  return { nodes, edges };
}

export default useSourceErdDag;
