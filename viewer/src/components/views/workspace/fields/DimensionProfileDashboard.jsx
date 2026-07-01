import React, { useEffect, useMemo, useRef, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { histogramTableLocally } from '../../../../duckdb/profiling';
import { getTypeColors } from '../../common/objectTypeConfigs';

/**
 * DimensionProfileDashboard — a dashboard-style column profile for a dimension
 * (replaces the table-style <ProfileStats> + <Histogram> pair in the Field Lens).
 *
 * Self-contained: given the DuckDB instance, the derived table + column, and a
 * pre-computed `profile` (from `profileTableLocally`), it renders KPI tiles, a
 * distribution chart (numeric histogram or categorical top-values), a numeric
 * spread box-plot, and a valid/null quality bar — all with CUSTOM SVG/CSS (no
 * embedded Plotly) so the charts stay crisp and self-sizing in the flex panel.
 *
 * The distribution chart owns an input toggle (bin-count for numeric, top-N for
 * categorical) and recomputes via `histogramTableLocally(db, table, col, bins)`.
 */

const ACCENT = '#14b8a6'; // teal-500 — the dimension connection handle tone.

const numberFmt = value => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Number.isInteger(value)) return value.toLocaleString();
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const compactNumber = value => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  }
  return numberFmt(n);
};

const percentFmt = value => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(1)}%`;
};

const axisLabel = value => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const n = Number(value);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

/** A single dashboard KPI tile: muted label over a large accented value. */
const KpiTile = ({ label, value, sub, accent, children, testId }) => (
  <div
    data-testid={testId}
    className="flex flex-col rounded-lg bg-white p-3 ring-1 ring-gray-200 shadow-sm"
  >
    <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
    <span
      className="mt-0.5 text-[18px] font-semibold leading-tight"
      style={{ color: accent || ACCENT }}
    >
      {value}
    </span>
    {sub && <span className="mt-0.5 text-[11px] text-gray-500">{sub}</span>}
    {children}
  </div>
);

const SectionCard = ({ title, control, children, testId }) => (
  <div
    data-testid={testId}
    className="rounded-lg bg-white p-3 ring-1 ring-gray-200 shadow-sm"
  >
    <div className="mb-2 flex items-center justify-between gap-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {control}
    </div>
    {children}
  </div>
);

/** Segmented [a|b|c] selector used for the bin-count / top-N toggles. */
const Segmented = ({ options, value, onChange, disabled, testId, ariaLabel, accent = ACCENT }) => (
  <div
    data-testid={testId}
    role="group"
    aria-label={ariaLabel}
    className="inline-flex overflow-hidden rounded-md ring-1 ring-gray-200"
  >
    {options.map(opt => {
      const active = opt === value;
      return (
        <button
          key={opt}
          type="button"
          data-testid={`${testId}-${opt}`}
          aria-pressed={active}
          disabled={disabled}
          onClick={() => onChange(opt)}
          className={`px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            active ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
          style={active ? { backgroundColor: accent } : undefined}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

/** Small inline toggle pill (used for the log-scale switch). */
const TogglePill = ({ on, onClick, label, testId, accent = ACCENT }) => (
  <button
    type="button"
    data-testid={testId}
    aria-pressed={on}
    onClick={onClick}
    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 transition-colors ${
      on ? 'text-white ring-transparent' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'
    }`}
    style={on ? { backgroundColor: accent } : undefined}
  >
    {label}
  </button>
);

const EmptyNote = ({ children, testId }) => (
  <div
    data-testid={testId}
    className="flex items-center justify-center rounded-md bg-gray-50 px-3 py-6 text-center text-[12px] text-gray-400"
  >
    {children}
  </div>
);

/** Vertical SVG bar histogram for numeric distributions. */
const NumericHistogram = ({ buckets, logScale, accent }) => {
  const [hovered, setHovered] = useState(null);

  if (!buckets || buckets.length === 0) {
    return <EmptyNote testId="dim-distribution-empty">Not enough data to plot a distribution.</EmptyNote>;
  }

  const W = 320;
  const H = 140;
  const padL = 4;
  const padR = 4;
  const padTop = 8;
  const padBottom = 4;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;

  const heights = buckets.map(b => {
    const c = Number(b.count) || 0;
    return logScale ? Math.log10(c + 1) : c;
  });
  const maxH = Math.max(...heights, 0);
  const gap = buckets.length > 40 ? 0.5 : 1.5;
  const slot = plotW / buckets.length;
  const barW = Math.max(slot - gap, 0.5);

  // Parse "[start, end)" ranges for the axis labels.
  const parseRange = range => {
    if (typeof range !== 'string') return [null, null];
    const m = range.match(/\[?\s*([-0-9.eE]+)\s*,\s*([-0-9.eE]+)/);
    if (!m) return [null, null];
    return [Number(m[1]), Number(m[2])];
  };
  const [minStart] = parseRange(buckets[0].range);
  const [, maxEnd] = parseRange(buckets[buckets.length - 1].range);

  return (
    <div className="relative">
      <svg
        data-testid="dim-histogram-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[140px] w-full"
        role="img"
        aria-label="Distribution histogram"
      >
        {buckets.map((b, i) => {
          const val = heights[i];
          const h = maxH > 0 ? (val / maxH) * plotH : 0;
          const x = padL + i * slot + (slot - barW) / 2;
          const y = padTop + (plotH - h);
          const isHover = hovered === i;
          return (
            <rect
              key={i}
              data-testid="dim-histogram-bar"
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 0.5)}
              rx={barW > 3 ? 1 : 0}
              fill={accent}
              opacity={isHover ? 1 : 0.85}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </svg>

      {/* x-axis min/max range labels */}
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{axisLabel(minStart)}</span>
        <span>{axisLabel(maxEnd)}</span>
      </div>

      {hovered !== null && buckets[hovered] && (
        <div
          data-testid="dim-histogram-tooltip"
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg"
        >
          {numberFmt(buckets[hovered].count)} · {buckets[hovered].range}
        </div>
      )}
    </div>
  );
};

/** Horizontal top-values bars for categorical distributions. */
const CategoricalBars = ({ buckets, totalCount, accent }) => {
  if (!buckets || buckets.length === 0) {
    return <EmptyNote testId="dim-distribution-empty">Not enough data to plot top values.</EmptyNote>;
  }
  const maxCount = Math.max(...buckets.map(b => Number(b.count) || 0), 0);

  return (
    <div className="space-y-1.5">
      {buckets.map((b, i) => {
        const count = Number(b.count) || 0;
        const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
        const barW = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const label = String(b.value ?? '');
        return (
          <div key={i} data-testid="dim-category-row" className="group">
            <div className="mb-0.5 flex items-center justify-between text-[11px]">
              <span className="max-w-[180px] truncate text-gray-600" title={label}>
                {label || '∅'}
              </span>
              <span className="ml-2 whitespace-nowrap text-gray-400">
                {numberFmt(count)} ({percentFmt(pct)})
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-gray-100">
              <div
                className="h-full rounded-sm transition-all duration-200"
                style={{ width: `${barW}%`, backgroundColor: accent }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Horizontal box-plot over the min→max axis (q25 / median / q75 + whiskers). */
const SpreadBoxPlot = ({ min, max, q25, median, q75, accent }) => {
  const vals = [min, max, q25, median, q75];
  const allPresent = vals.every(v => v !== null && v !== undefined && !Number.isNaN(Number(v)));
  if (!allPresent || Number(max) === Number(min)) {
    return (
      <EmptyNote testId="dim-spread-empty">
        Not enough spread to draw a box plot (single value or missing quartiles).
      </EmptyNote>
    );
  }

  const lo = Number(min);
  const hi = Number(max);
  const span = hi - lo || 1;
  const W = 320;
  const H = 56;
  const padX = 8;
  const plotW = W - padX * 2;
  const axisY = 28;
  const boxH = 18;
  const pos = v => padX + ((Number(v) - lo) / span) * plotW;

  const xQ25 = pos(q25);
  const xQ75 = pos(q75);
  const xMed = pos(median);
  const xMin = pos(min);
  const xMax = pos(max);

  return (
    <div>
      <svg
        data-testid="dim-boxplot-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[56px] w-full"
        role="img"
        aria-label="Spread box plot"
      >
        {/* whisker line */}
        <line x1={xMin} y1={axisY} x2={xMax} y2={axisY} stroke="#9ca3af" strokeWidth="1.5" />
        {/* whisker caps */}
        <line x1={xMin} y1={axisY - 6} x2={xMin} y2={axisY + 6} stroke="#9ca3af" strokeWidth="1.5" />
        <line x1={xMax} y1={axisY - 6} x2={xMax} y2={axisY + 6} stroke="#9ca3af" strokeWidth="1.5" />
        {/* IQR box */}
        <rect
          data-testid="dim-boxplot-box"
          x={Math.min(xQ25, xQ75)}
          y={axisY - boxH / 2}
          width={Math.max(Math.abs(xQ75 - xQ25), 1)}
          height={boxH}
          rx="2"
          fill={accent}
          opacity="0.25"
          stroke={accent}
          strokeWidth="1.5"
        />
        {/* median line */}
        <line
          x1={xMed}
          y1={axisY - boxH / 2}
          x2={xMed}
          y2={axisY + boxH / 2}
          stroke={accent}
          strokeWidth="2"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>min {axisLabel(min)}</span>
        <span>q25 {axisLabel(q25)}</span>
        <span>med {axisLabel(median)}</span>
        <span>q75 {axisLabel(q75)}</span>
        <span>max {axisLabel(max)}</span>
      </div>
    </div>
  );
};

const DimensionProfileDashboard = ({ db, tableName, column, profile, rowCount }) => {
  const colors = getTypeColors('dimension');
  const accent = colors.connectionHandle || ACCENT;

  const isNumeric = profile?.avg !== null && profile?.avg !== undefined;

  const [bins, setBins] = useState(20);
  const [topN, setTopN] = useState(10);
  const [logScale, setLogScale] = useState(false);
  const [histogram, setHistogram] = useState(null);
  const [histLoading, setHistLoading] = useState(false);
  // Keep the LAST good histogram visible during a recompute (no flash to empty).
  const lastHistRef = useRef(null);

  const requestBins = isNumeric ? bins : topN;

  useEffect(() => {
    if (!db || !tableName || !column) return;
    let cancelled = false;
    setHistLoading(true);
    (async () => {
      try {
        const hist = await histogramTableLocally(db, tableName, column, requestBins);
        if (cancelled) return;
        setHistogram(hist);
        lastHistRef.current = hist;
      } catch {
        if (!cancelled) setHistogram(null);
      } finally {
        if (!cancelled) setHistLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, tableName, column, requestBins]);

  // The histogram to render: live one when present, else the last good one so a
  // recompute never flashes to empty.
  const shownHistogram = histogram || lastHistRef.current;
  const buckets = shownHistogram?.buckets || [];
  const histTotal = shownHistogram?.total_count ?? rowCount ?? 0;
  const categorical = buckets.length > 0 && buckets[0].value !== undefined;

  const nullPct = profile?.null_percentage ?? 0;
  const validPct = Math.max(0, 100 - nullPct);
  const nullCount = profile?.null_count ?? 0;
  const distinct = profile?.distinct ?? 0;
  const distinctRatio = rowCount ? (distinct / rowCount) * 100 : null;
  const nonNullCount = rowCount != null ? rowCount - nullCount : null;

  const distributionTitle = categorical ? 'Top Values' : 'Distribution';
  const distributionControl = useMemo(() => {
    if (categorical) {
      return (
        <Segmented
          testId="dim-topn-toggle"
          ariaLabel="Top values count"
          options={[5, 10, 20]}
          value={topN}
          onChange={setTopN}
          disabled={histLoading}
          accent={accent}
        />
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <TogglePill
          testId="dim-log-toggle"
          on={logScale}
          onClick={() => setLogScale(v => !v)}
          label="log"
          accent={accent}
        />
        <Segmented
          testId="dim-bins-toggle"
          ariaLabel="Histogram bin count"
          options={[10, 20, 50]}
          value={bins}
          onChange={setBins}
          disabled={histLoading}
          accent={accent}
        />
      </div>
    );
  }, [categorical, topN, bins, logScale, histLoading, accent]);

  return (
    <div data-testid="dimension-profile-dashboard" className="flex flex-col gap-3">
      {/* Type pill + KPI tile row */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] ${colors.bg} ${colors.text}`}
        >
          {profile?.type || 'unknown'}
        </span>
      </div>

      <div
        data-testid="dim-kpi-row"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        <KpiTile
          testId="dim-kpi-rows"
          label="Rows"
          value={compactNumber(rowCount)}
          accent={accent}
        />
        <KpiTile
          testId="dim-kpi-distinct"
          label="Distinct"
          value={compactNumber(distinct)}
          sub={distinctRatio != null ? `${percentFmt(distinctRatio)} of rows` : undefined}
          accent={accent}
        />
        <KpiTile testId="dim-kpi-null" label="Null %" value={percentFmt(nullPct)} accent={accent}>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-highlight-400"
              style={{ width: `${Math.min(nullPct, 100)}%` }}
            />
          </div>
        </KpiTile>
        {isNumeric && (
          <>
            <KpiTile
              testId="dim-kpi-mean"
              label="Mean"
              value={compactNumber(profile?.avg)}
              accent={accent}
            />
            <KpiTile
              testId="dim-kpi-median"
              label="Median"
              value={compactNumber(profile?.median)}
              accent={accent}
            />
            <KpiTile
              testId="dim-kpi-std"
              label="Std Dev"
              value={compactNumber(profile?.std_dev)}
              accent={accent}
            />
          </>
        )}
      </div>

      {/* Distribution — the centerpiece */}
      <SectionCard
        testId="dim-distribution-card"
        title={distributionTitle}
        control={
          <div className="flex items-center gap-2">
            {histLoading && (
              <CircularProgress
                data-testid="dim-distribution-spinner"
                size={12}
                style={{ color: accent }}
              />
            )}
            {distributionControl}
          </div>
        }
      >
        {categorical ? (
          <CategoricalBars buckets={buckets} totalCount={histTotal} accent={accent} />
        ) : (
          <NumericHistogram buckets={buckets} logScale={logScale} accent={accent} />
        )}
      </SectionCard>

      {/* Spread (numeric only) */}
      {isNumeric && (
        <SectionCard testId="dim-spread-card" title="Spread">
          <SpreadBoxPlot
            min={profile?.min}
            max={profile?.max}
            q25={profile?.q25}
            median={profile?.median}
            q75={profile?.q75}
            accent={accent}
          />
        </SectionCard>
      )}

      {/* Quality — valid/null stacked bar + distinct */}
      <SectionCard testId="dim-quality-card" title="Quality">
        <div className="mb-1 flex justify-between text-[11px]">
          <span className="font-medium text-green-600">{percentFmt(validPct)} valid</span>
          <span className="font-medium text-highlight-600">{percentFmt(nullPct)} null</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            data-testid="dim-quality-valid"
            className="h-full bg-green-500 transition-all duration-200"
            style={{ width: `${validPct}%` }}
          />
          {nullPct > 0 && (
            <div
              data-testid="dim-quality-null"
              className="h-full bg-highlight-400 transition-all duration-200"
              style={{ width: `${nullPct}%` }}
            />
          )}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] text-gray-500">
          <span>
            Valid{' '}
            <span className="font-medium text-gray-700">
              {nonNullCount != null ? numberFmt(nonNullCount) : '—'}
            </span>
          </span>
          <span>
            Null <span className="font-medium text-gray-700">{numberFmt(nullCount)}</span>
          </span>
          <span>
            Distinct <span className="font-medium text-gray-700">{numberFmt(distinct)}</span>
          </span>
        </div>
      </SectionCard>
    </div>
  );
};

export default DimensionProfileDashboard;
