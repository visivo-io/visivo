import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { PiChartBar } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { useDuckDB } from '../../../../contexts/DuckDBContext';
import { useModelQueryJob } from '../../../../hooks/useModelQueryJob';
import { getConnection } from '../../../../duckdb/duckdb';
import { profileTableLocally } from '../../../../duckdb/profiling';
import { getTypeColors } from '../../common/objectTypeConfigs';
import DimensionProfileDashboard from './DimensionProfileDashboard';
import { useFieldParentModel } from './useFieldParentModel';

/**
 * DimensionInspector — the Field Lens body for a `dimension` (VIS-1009).
 *
 * A one-dimension studio bound to its parent model: it shows the dimension's
 * expression, runs the parent model's SQL against its source (the same
 * `useModelQueryJob` path ModelPreview / the Explorer SQL editor use), loads the
 * rows into DuckDB-WASM, and PROFILES the dimension expression as a DERIVED
 * column (`<expression> AS <dimension>`). The profile is computed with
 * `profileTableLocally` and rendered as a DASHBOARD-style column profile via
 * <DimensionProfileDashboard> (KPI tiles + a distribution chart with bin toggles
 * + a box-plot + a quality bar) — the dashboard owns its own histogram recompute.
 *
 * The frame mounts this read-only `preview` lens; editing lives in the right rail.
 */
const DERIVED_COL = '__dimension__';

const FieldCallout = ({ testId, title, body }) => (
  <div
    data-testid={testId}
    className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
  >
    <div className="max-w-[360px]">
      <h3 className="text-[14px] font-semibold text-gray-800">{title}</h3>
      {body && <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{body}</p>}
    </div>
  </div>
);

const DimensionInspector = ({ activeObject, record: providedRecord }) => {
  const name = activeObject?.name || null;
  const dimensions = useStore(s => s.dimensions);
  const fetchDimensions = useStore(s => s.fetchDimensions);

  useEffect(() => {
    if ((!dimensions || dimensions.length === 0) && typeof fetchDimensions === 'function') {
      fetchDimensions();
    }
  }, [dimensions, fetchDimensions]);

  // The collection entry (carries parentModel + config). The frame hands the
  // unwrapped config as `record`; we still need the raw entry for parentModel.
  const fieldRecord = useMemo(
    () => (Array.isArray(dimensions) ? dimensions.find(d => d.name === name) || null : null),
    [dimensions, name]
  );

  const expression = useMemo(() => {
    const cfg = fieldRecord?.config || providedRecord || null;
    return cfg?.expression || null;
  }, [fieldRecord, providedRecord]);

  const { parentModelName, modelConfig, sourceName, status: parentStatus } =
    useFieldParentModel(fieldRecord);
  const modelSql = modelConfig?.sql || null;

  const db = useDuckDB();
  const { status: jobStatus, progressMessage, result, error, isRunning, executeQuery } =
    useModelQueryJob();

  const [hasRun, setHasRun] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiling, setProfiling] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const tableRef = useRef(null);

  const colors = getTypeColors('dimension');

  const handleRun = useCallback(() => {
    if (!sourceName || !modelSql) return;
    setHasRun(true);
    setProfile(null);
    setProfileError(null);
    executeQuery(sourceName, modelSql).catch(() => {});
  }, [sourceName, modelSql, executeQuery]);

  // When the model run completes, load its rows into DuckDB with the dimension
  // expression as a derived column, then profile that derived column.
  useEffect(() => {
    const rows = result?.rows || result?.data || null;
    if (jobStatus !== 'completed' || !db || !expression || !Array.isArray(rows) || rows.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      setProfiling(true);
      setProfileError(null);
      setProfile(null);
      try {
        const conn = await getConnection(db);
        const baseTable = `dim_base_${Date.now()}`;
        const derivedTable = `dim_derived_${Date.now()}`;
        const tempFile = `dim_data_${Date.now()}.json`;

        await db.registerFileText(tempFile, JSON.stringify(rows));
        await conn.query(
          `CREATE TABLE "${baseTable}" AS SELECT * FROM read_json_auto('${tempFile}')`
        );
        await db.dropFile(tempFile);

        // Derive the dimension as a single column so the profiler treats it like
        // any other column (the expression is already DuckDB-dialect SQL here).
        await conn.query(
          `CREATE TABLE "${derivedTable}" AS SELECT (${expression}) AS "${DERIVED_COL}" FROM "${baseTable}"`
        );
        await conn.query(`DROP TABLE IF EXISTS "${baseTable}"`);
        tableRef.current = derivedTable;

        const profileResult = await profileTableLocally(db, derivedTable);
        if (cancelled) return;
        const col = (profileResult.columns || []).find(c => c.name === DERIVED_COL) || null;
        setProfile(col ? { ...col, name, row_count: profileResult.row_count } : null);
      } catch (err) {
        if (!cancelled) setProfileError(err.message || String(err));
      } finally {
        if (!cancelled) setProfiling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobStatus, db, expression, result, name]);

  // Drop the derived table on unmount.
  useEffect(() => {
    return () => {
      if (tableRef.current && db) {
        getConnection(db).then(conn =>
          conn.query(`DROP TABLE IF EXISTS "${tableRef.current}"`).catch(() => {})
        );
      }
    };
  }, [db]);

  if (parentStatus === 'no-parent') {
    return (
      <FieldCallout
        testId="dimension-inspector-no-parent"
        title="No parent model"
        body={`Dimension "${name}" isn't bound to a model, so its expression can't be profiled.`}
      />
    );
  }
  if (parentStatus === 'model-not-found') {
    return (
      <FieldCallout
        testId="dimension-inspector-no-parent"
        title="Parent model unavailable"
        body={`The model "${parentModelName}" that owns this dimension couldn't be resolved.`}
      />
    );
  }

  const rowCount = profile?.row_count ?? null;

  return (
    <div
      data-testid="dimension-inspector"
      className="flex flex-1 min-h-0 flex-col overflow-hidden bg-white"
    >
      {/* Header: parent model + run */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-[12px] text-gray-500">
          {parentModelName ? (
            <>
              Model: <span className="font-mono text-gray-700">{parentModelName}</span>
            </>
          ) : (
            'Resolving model…'
          )}
        </span>
        <button
          type="button"
          data-testid="dimension-inspector-run"
          onClick={handleRun}
          disabled={isRunning || profiling || !sourceName || !modelSql}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-[#0d9488] px-3 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0f766e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning || profiling ? (
            <CircularProgress size={12} style={{ color: 'white' }} />
          ) : (
            <PlayArrowIcon style={{ fontSize: 16 }} />
          )}
          Profile
        </button>
      </div>

      {/* Expression */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}
          >
            <PiChartBar className="h-3 w-3" aria-hidden="true" />
            Dimension
          </span>
          <span className="text-[12px] font-semibold text-gray-900">{name}</span>
        </div>
        <pre
          data-testid="dimension-inspector-expression"
          className="overflow-x-auto rounded-md bg-gray-900 px-3 py-2 font-mono text-[12px] leading-relaxed text-gray-100"
        >
          {expression || '(no expression)'}
        </pre>
      </div>

      {/* Profile region */}
      <div
        data-testid="dimension-inspector-profile"
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3"
      >
        {!hasRun ? (
          <FieldCallout
            testId="dimension-inspector-idle"
            title="Profile this dimension"
            body="Run to evaluate the expression against its parent model and see its distribution, null rate, and distinct counts."
          />
        ) : isRunning ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircularProgress size={28} />
            <span className="text-sm text-gray-600">{progressMessage || 'Running model…'}</span>
          </div>
        ) : error ? (
          <div
            data-testid="dimension-inspector-error"
            className="rounded bg-red-50 p-3 font-mono text-sm text-red-700"
          >
            {typeof error === 'string' ? error : error?.message || String(error)}
          </div>
        ) : profileError ? (
          <div
            data-testid="dimension-inspector-error"
            className="rounded bg-red-50 p-3 font-mono text-sm text-red-700"
          >
            {profileError}
          </div>
        ) : profiling ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircularProgress size={28} />
            <span className="text-sm text-gray-600">Profiling the expression…</span>
          </div>
        ) : profile ? (
          <DimensionProfileDashboard
            db={db}
            tableName={tableRef.current}
            column={DERIVED_COL}
            profile={profile}
            rowCount={rowCount}
          />
        ) : (
          <FieldCallout
            testId="dimension-inspector-empty"
            title="No rows to profile"
            body="The parent model returned no rows, so the expression has nothing to profile."
          />
        )}
      </div>
    </div>
  );
};

export default DimensionInspector;
