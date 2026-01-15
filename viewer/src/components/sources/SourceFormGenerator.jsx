import React, { useState } from 'react';

// Eye icon for showing password
const EyeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-5 h-5"
  >
    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    <path
      fillRule="evenodd"
      d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
      clipRule="evenodd"
    />
  </svg>
);

// Eye-slash icon for hiding password
const EyeSlashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-5 h-5"
  >
    <path
      fillRule="evenodd"
      d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z"
      clipRule="evenodd"
    />
    <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
  </svg>
);

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
      {
        name: 'account',
        label: 'Account',
        type: 'text',
        required: true,
        placeholder: 'account.region',
      },
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
      {
        name: 'credentials_path',
        label: 'Credentials Path',
        type: 'text',
        placeholder: 'path/to/credentials.json',
      },
    ],
  },
  duckdb: {
    fields: [
      {
        name: 'database',
        label: 'Database Path',
        type: 'text',
        required: true,
        placeholder: ':memory: or path/to/db.duckdb',
      },
    ],
  },
  sqlite: {
    fields: [
      {
        name: 'database',
        label: 'Database Path',
        type: 'text',
        required: true,
        placeholder: 'path/to/database.db',
      },
    ],
  },
  csv: {
    fields: [
      {
        name: 'path',
        label: 'CSV Path',
        type: 'text',
        required: true,
        placeholder: 'path/to/data.csv',
      },
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
      {
        name: 'host',
        label: 'Host',
        type: 'text',
        required: true,
        placeholder: 'adb-xxx.azuredatabricks.net',
      },
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
  // Track visibility state for password fields
  const [visibleFields, setVisibleFields] = useState({});

  const handleFieldChange = (fieldName, value) => {
    onChange({
      ...values,
      [fieldName]: value,
    });
  };

  const toggleFieldVisibility = fieldName => {
    setVisibleFields(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  // Determine the input type for a field
  const getInputType = field => {
    if (field.type === 'number') return 'number';
    if (field.type === 'password') {
      return visibleFields[field.name] ? 'text' : 'password';
    }
    return 'text';
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
            type={getInputType(field)}
            id={field.name}
            name={field.name}
            value={values[field.name] ?? field.default ?? ''}
            onChange={e => {
              const val =
                field.type === 'number'
                  ? e.target.value
                    ? Number(e.target.value)
                    : ''
                  : e.target.value;
              handleFieldChange(field.name, val);
            }}
            placeholder={field.placeholder || ''}
            className={`
              block w-full px-3 py-2.5 text-sm text-gray-900
              bg-white rounded-md border appearance-none
              focus:outline-none focus:ring-2 focus:border-primary-500
              peer placeholder-transparent
              ${field.type === 'password' ? 'pr-10' : ''}
              ${
                errors[field.name]
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-primary-500'
              }
            `}
          />
          {field.type === 'password' && (
            <button
              type="button"
              onClick={() => toggleFieldVisibility(field.name)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              title={visibleFields[field.name] ? 'Hide' : 'Show'}
            >
              {visibleFields[field.name] ? <EyeSlashIcon /> : <EyeIcon />}
            </button>
          )}
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
          {errors[field.name] && <p className="mt-1 text-xs text-red-500">{errors[field.name]}</p>}
        </div>
      ))}
    </div>
  );
};

export default SourceFormGenerator;
