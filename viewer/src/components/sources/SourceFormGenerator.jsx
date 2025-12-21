import React from 'react';

// Schema definitions for each source type
// Based on backend Pydantic models in visivo/models/sources/
const SOURCE_SCHEMAS = {
  postgresql: {
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', default: 5432 },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'db_schema', label: 'Schema', type: 'text', placeholder: 'public' },
      { name: 'connection_pool_size', label: 'Connection Pool Size', type: 'number', default: 1 },
    ],
  },
  mysql: {
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { name: 'port', label: 'Port', type: 'number', default: 3306 },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'db_schema', label: 'Schema', type: 'text' },
    ],
  },
  snowflake: {
    fields: [
      { name: 'account', label: 'Account', type: 'text', required: true, placeholder: 'account.region' },
      { name: 'database', label: 'Database', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      { name: 'warehouse', label: 'Warehouse', type: 'text' },
      { name: 'db_schema', label: 'Schema', type: 'text' },
      { name: 'role', label: 'Role', type: 'text' },
    ],
  },
  bigquery: {
    fields: [
      { name: 'project', label: 'Project ID', type: 'text', required: true },
      { name: 'database', label: 'Dataset', type: 'text', required: true },
      { name: 'credentials_path', label: 'Credentials Path', type: 'text', placeholder: 'path/to/credentials.json' },
    ],
  },
  duckdb: {
    fields: [
      { name: 'database', label: 'Database Path', type: 'text', required: true, placeholder: ':memory: or path/to/db.duckdb' },
    ],
  },
  sqlite: {
    fields: [
      { name: 'database', label: 'Database Path', type: 'text', required: true, placeholder: 'path/to/database.db' },
    ],
  },
  csv: {
    fields: [
      { name: 'path', label: 'CSV Path', type: 'text', required: true, placeholder: 'path/to/data.csv' },
    ],
  },
  trino: {
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Port', type: 'number', default: 8080 },
      { name: 'database', label: 'Catalog', type: 'text', required: true },
      { name: 'username', label: 'Username', type: 'text' },
      { name: 'db_schema', label: 'Schema', type: 'text' },
    ],
  },
  databricks: {
    fields: [
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'adb-xxx.azuredatabricks.net' },
      { name: 'http_path', label: 'HTTP Path', type: 'text', required: true },
      { name: 'database', label: 'Database/Catalog', type: 'text', required: true },
      { name: 'access_token', label: 'Access Token', type: 'password', required: true },
      { name: 'db_schema', label: 'Schema', type: 'text' },
    ],
  },
};

// Get schema for a source type (returns empty fields if type not found)
export const getSourceSchema = type => {
  return SOURCE_SCHEMAS[type] || { fields: [] };
};

const SourceFormGenerator = ({ sourceType, values, onChange, errors = {} }) => {
  const schema = getSourceSchema(sourceType);

  const handleFieldChange = (fieldName, value) => {
    onChange({
      ...values,
      [fieldName]: value,
    });
  };

  if (!sourceType) {
    return (
      <div className="text-gray-500 text-sm italic py-4">
        Select a source type to configure connection settings
      </div>
    );
  }

  if (schema.fields.length === 0) {
    return (
      <div className="text-amber-600 text-sm py-4">
        Configuration schema not available for source type: {sourceType}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {schema.fields.map(field => (
        <div key={field.name} className="relative">
          <input
            type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
            id={field.name}
            name={field.name}
            value={values[field.name] ?? field.default ?? ''}
            onChange={e => {
              const val = field.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value;
              handleFieldChange(field.name, val);
            }}
            placeholder={field.placeholder || ''}
            className={`
              block w-full px-3 py-2.5 text-sm text-gray-900
              bg-white rounded-md border appearance-none
              focus:outline-none focus:ring-2 focus:border-primary-500
              peer placeholder-transparent
              ${errors[field.name]
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:ring-primary-500'
              }
            `}
          />
          <label
            htmlFor={field.name}
            className={`
              absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
              bg-white px-1 left-2
              peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:top-1/2
              peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
              ${errors[field.name] ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
            `}
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {errors[field.name] && (
            <p className="mt-1 text-xs text-red-500">{errors[field.name]}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default SourceFormGenerator;
