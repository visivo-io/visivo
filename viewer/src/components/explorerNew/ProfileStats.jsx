import React from 'react';

const formatNumber = value => {
  if (value === null || value === undefined) return '—';
  if (Number.isInteger(value)) return value.toLocaleString();
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const formatPercent = value => {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(1)}%`;
};

const formatValue = (value, type) => {
  if (value === null || value === undefined) return '—';
  if (type === 'DATE' || type === 'TIMESTAMP' || type === 'date' || type === 'timestamp') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return type === 'DATE' || type === 'date' ? d.toLocaleDateString() : d.toLocaleString();
    }
  }
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
};

const StatRow = ({ label, value }) => (
  <div className="flex justify-between items-baseline py-0.5">
    <span className="text-xs text-secondary-500">{label}</span>
    <span className="text-xs font-medium text-secondary-700 text-right ml-2 truncate max-w-[140px]">
      {value}
    </span>
  </div>
);

const ProfileStats = ({ profile, rowCount }) => {
  if (!profile) return null;

  const nullPct = profile.null_percentage ?? 0;
  const validPct = 100 - nullPct;
  const nullCount = profile.null_count ?? 0;
  const nonNullCount = rowCount != null ? rowCount - nullCount : null;
  const isNumeric = profile.avg !== null && profile.avg !== undefined;

  return (
    <div className="space-y-3">
      {/* Data Quality */}
      <div>
        <h4 className="text-xs font-medium text-secondary-600 uppercase tracking-wide mb-1.5">
          Data Quality
        </h4>

        {/* Null bar */}
        <div className="mb-2">
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-secondary-500">Valid</span>
            <span className="text-secondary-500">Null</span>
          </div>
          <div className="h-2 w-full bg-secondary-200 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-green-500 transition-all duration-200"
              style={{ width: `${validPct}%` }}
              data-testid="valid-bar"
            />
            {nullPct > 0 && (
              <div
                className="h-full bg-highlight-400 transition-all duration-200"
                style={{ width: `${nullPct}%` }}
                data-testid="null-bar"
              />
            )}
          </div>
          <div className="flex justify-between text-xs mt-0.5">
            <span className="text-green-600 font-medium">{formatPercent(validPct)}</span>
            <span className="text-highlight-600 font-medium">{formatPercent(nullPct)}</span>
          </div>
        </div>

        <StatRow label="Null Count" value={formatNumber(nullCount)} />
        {nonNullCount !== null && (
          <StatRow
            label="Non-null"
            value={`${formatNumber(nonNullCount)} of ${formatNumber(rowCount)}`}
          />
        )}
        <StatRow label="Distinct" value={formatNumber(profile.distinct)} />
      </div>

      {/* Range */}
      {profile.min !== null && profile.min !== undefined && (
        <div>
          <h4 className="text-xs font-medium text-secondary-600 uppercase tracking-wide mb-1.5">
            Range
          </h4>
          <StatRow label="Min" value={formatValue(profile.min, profile.type)} />
          <StatRow label="Max" value={formatValue(profile.max, profile.type)} />
        </div>
      )}

      {/* Central Tendency (numeric only) */}
      {isNumeric && (
        <div>
          <h4 className="text-xs font-medium text-secondary-600 uppercase tracking-wide mb-1.5">
            Central Tendency
          </h4>
          <StatRow label="Mean" value={formatNumber(profile.avg)} />
          <StatRow label="Median" value={formatNumber(profile.median)} />
          <StatRow label="Std Dev" value={formatNumber(profile.std_dev)} />
        </div>
      )}

      {/* Percentiles (numeric only) */}
      {isNumeric && profile.q25 !== null && profile.q25 !== undefined && (
        <div>
          <h4 className="text-xs font-medium text-secondary-600 uppercase tracking-wide mb-1.5">
            Percentiles
          </h4>
          <StatRow label="25th" value={formatNumber(profile.q25)} />
          <StatRow label="50th" value={formatNumber(profile.median)} />
          <StatRow label="75th" value={formatNumber(profile.q75)} />
        </div>
      )}
    </div>
  );
};

export default ProfileStats;
