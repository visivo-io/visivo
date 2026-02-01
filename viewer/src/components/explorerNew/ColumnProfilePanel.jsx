import React, { useState, useEffect, useCallback } from 'react';
import { PiX, PiSpinner, PiChartBar, PiCopy } from 'react-icons/pi';
import { histogramTableLocally } from '../../duckdb/profiling';
import ProfileStats from './ProfileStats';
import Histogram from './Histogram';

const NUMERIC_TYPES = [
  'INTEGER',
  'BIGINT',
  'FLOAT',
  'DOUBLE',
  'DECIMAL',
  'NUMERIC',
  'REAL',
  'SMALLINT',
  'TINYINT',
  'HUGEINT',
  'UHUGEINT',
  'UBIGINT',
  'UINTEGER',
  'USMALLINT',
  'UTINYINT',
  'INT',
  'INT2',
  'INT4',
  'INT8',
];

const isNumericType = type => {
  if (!type) return false;
  const upper = type.toUpperCase();
  return (
    NUMERIC_TYPES.some(t => upper.includes(t)) ||
    upper.includes('FLOAT') ||
    upper.includes('DOUBLE') ||
    upper.includes('DECIMAL')
  );
};

const formatStatsForCopy = (profile, rowCount) => {
  if (!profile) return '';
  const lines = [`Column: ${profile.name}`, `Type: ${profile.type}`];
  lines.push(`Null %: ${profile.null_percentage?.toFixed(1) ?? '—'}%`);
  lines.push(`Null Count: ${profile.null_count ?? '—'}`);
  if (rowCount != null) lines.push(`Row Count: ${rowCount}`);
  lines.push(`Distinct: ${profile.distinct ?? '—'}`);
  if (profile.min !== null && profile.min !== undefined) lines.push(`Min: ${profile.min}`);
  if (profile.max !== null && profile.max !== undefined) lines.push(`Max: ${profile.max}`);
  if (profile.avg !== null && profile.avg !== undefined) {
    lines.push(`Mean: ${profile.avg}`);
    lines.push(`Median: ${profile.median}`);
    lines.push(`Std Dev: ${profile.std_dev}`);
    if (profile.q25 !== null && profile.q25 !== undefined) {
      lines.push(`25th Percentile: ${profile.q25}`);
      lines.push(`50th Percentile: ${profile.median}`);
      lines.push(`75th Percentile: ${profile.q75}`);
    }
  }
  return lines.join('\n');
};

const ColumnProfilePanel = ({ column, profile, db, tableName, rowCount, onClose, isOpen }) => {
  const [histogram, setHistogram] = useState(null);
  const [histogramLoading, setHistogramLoading] = useState(false);
  const [histogramError, setHistogramError] = useState(null);
  const [showHistogram, setShowHistogram] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset histogram state when column changes
  useEffect(() => {
    setHistogram(null);
    setHistogramLoading(false);
    setHistogramError(null);
    setShowHistogram(false);
    setCopied(false);
  }, [column]);

  const handleLoadHistogram = useCallback(async () => {
    if (!db || !tableName || !column) return;
    setShowHistogram(true);
    setHistogramLoading(true);
    setHistogramError(null);
    try {
      const data = await histogramTableLocally(db, tableName, column);
      setHistogram(data);
    } catch (err) {
      setHistogramError(err.message || 'Failed to load histogram');
    } finally {
      setHistogramLoading(false);
    }
  }, [db, tableName, column]);

  const handleCopyStats = useCallback(async () => {
    const text = formatStatsForCopy(profile, rowCount);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: ignored in non-secure contexts
    }
  }, [profile, rowCount]);

  if (!isOpen || !profile) return null;

  const numeric = isNumericType(profile.type);
  const buttonLabel = numeric ? 'Show Distribution' : 'Show Top Values';

  return (
    <div className="w-80 flex-shrink-0 border-l border-secondary-200 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-secondary-800 truncate" title={column}>
            {column}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1 rounded text-secondary-400 hover:text-secondary-600 hover:bg-secondary-100 transition-colors"
          aria-label="Close profile panel"
        >
          <PiX size={16} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Type badge */}
        <span className="inline-block text-xs font-mono bg-secondary-100 text-secondary-600 rounded px-2 py-0.5">
          {profile.type}
        </span>

        {/* Statistics */}
        <ProfileStats profile={profile} rowCount={rowCount} />

        {/* Histogram section */}
        <div>
          {!showHistogram ? (
            <button
              onClick={handleLoadHistogram}
              className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 transition-colors"
            >
              <PiChartBar size={14} />
              {buttonLabel}
            </button>
          ) : histogramLoading ? (
            <div className="flex items-center gap-2 py-2">
              <PiSpinner className="animate-spin text-secondary-400" size={14} />
              <span className="text-xs text-secondary-500">Loading...</span>
            </div>
          ) : histogramError ? (
            <p className="text-xs text-highlight" data-testid="histogram-error">
              {histogramError}
            </p>
          ) : (
            <Histogram data={histogram} />
          )}
        </div>
      </div>

      {/* Actions footer */}
      <div className="px-4 py-2 border-t border-secondary-200">
        <button
          onClick={handleCopyStats}
          className="flex items-center gap-1.5 text-xs text-secondary-500 hover:text-secondary-700 transition-colors"
        >
          <PiCopy size={14} />
          {copied ? 'Copied!' : 'Copy Stats'}
        </button>
      </div>
    </div>
  );
};

export default ColumnProfilePanel;
