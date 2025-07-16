import React from 'react';
import { TYPE_STYLE_MAP } from '../../styled/VisivoObjectStyles';
import { HiOutlineDatabase } from 'react-icons/hi';

const SourcePill = ({ source, children, onClick, className = '' }) => {
  // Map source type to the correct style configuration
  const getTypeKey = source => {
    if (!source || !source.type) return null;

    // Map source types to their style keys
    const typeMap = {
      duckdb: 'DuckdbSource',
      mysql: 'MysqlSource',
      postgresql: 'PostgresqlSource',
      snowflake: 'SnowflakeSource',
      sqlite: 'SqliteSource',
      bigquery: 'BigQuerySource',
    };

    return typeMap[source.type.toLowerCase()] || null;
  };

  const typeKey = getTypeKey(source);
  const typeConfig = TYPE_STYLE_MAP[typeKey] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    icon: HiOutlineDatabase,
  };

  const Icon = typeConfig.icon;

  return (
    <div
      className={`flex items-center justify-between p-2 shadow-md rounded-2xl border ${typeConfig.bg} ${typeConfig.border} cursor-pointer hover:opacity-80 hover:shadow-lg transition-opacity ${className}`}
      style={{ minWidth: '30px', maxWidth: '400px', flex: '1 1 auto' }}
      onClick={onClick}
    >
      <div className="flex items-center min-w-0 flex-1">
        <div className="group relative flex-shrink-0">
          <Icon className={`w-5 h-5 mr-2 ${typeConfig.text}`} />
        </div>
        <span className={`text-sm font-medium ${typeConfig.text} truncate`} title={source.name}>
          {source.name}
        </span>
      </div>
      {children}
    </div>
  );
};

export default SourcePill;
