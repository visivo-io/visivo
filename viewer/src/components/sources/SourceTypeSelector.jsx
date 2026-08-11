import React from 'react';
import Select from '../common/Select';

// Available source types — must stay in sync with visivo's SourceField union
// (visivo/models/sources/fields.py) AND the field schemas in
// SourceFormGenerator's SOURCE_SCHEMAS. Every entry here needs a schema there,
// or the form shows "Configuration schema not available". (trino/databricks are
// NOT visivo source types; redshift/clickhouse are, and have schemas.)
export const SOURCE_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'redshift', label: 'Redshift' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'csv', label: 'CSV' },
];

const SourceTypeSelector = ({ value, onChange, disabled = false }) => {
  return (
    <div className="relative">
      <Select
        data-testid="source-type-select"
        aria-label="Source Type"
        placeholder="Select source type..."
        value={value || ''}
        options={SOURCE_TYPES}
        onChange={v => onChange(v || '')}
        disabled={disabled}
      />
      <label className="absolute text-sm text-gray-500 -top-2 left-2 bg-white px-1 z-10">
        Source Type
      </label>
    </div>
  );
};

export default SourceTypeSelector;
