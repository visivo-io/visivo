import {
  HiOutlineChartBar,
  HiOutlineDatabase,
  HiOutlineViewGrid,
  HiOutlineSelector,
  HiOutlineTable,
} from 'react-icons/hi';
import { MdScatterPlot, MdOutlineTableView } from 'react-icons/md';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { FaGear } from 'react-icons/fa6';
import { SiDuckdb, SiPostgresql, SiSnowflake, SiSqlite, SiGooglebigquery, SiAmazonredshift } from 'react-icons/si';
import { TbAlertCircle, TbBrandMysql } from 'react-icons/tb';
import { GrDocumentCsv, GrDocumentExcel } from 'react-icons/gr';

export const TYPE_VALUE_MAP = {
  CSVFileSource: {
    value: 'csv'
  },
  ExcelFileSource: {
    value: 'xls'
  },
  BigQuerySource: {
    value: 'bigquery'
  },
  SnowflakeSource: {
    value: 'snowflake'
  },
  MysqlSource: {
    value: 'mysql'
  },
  PostgresqlSource: {
    value: 'postgresql'
  },
  RedshiftSource: {
    value: 'redshift'
  },
  DuckdbSource: {
    value: 'duckdb'
  },
  SqliteSource: {
    value: 'sqlite'
  }
}

export const TYPE_STYLE_MAP = {
  Chart: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: HiOutlineChartBar,
  },
  CsvScriptModel: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: GrDocumentCsv,
  },
  CSVFileSource: {
    bg: 'bg-teal-100',
    text: 'text-teal-800',
    border: 'border-teal-200',
    icon: GrDocumentCsv,
  },
  Dashboard: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: HiOutlineViewGrid,
  },
  ExcelFileSource: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: GrDocumentExcel,
  },
  Selector: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    icon: HiOutlineSelector,
  },
  Table: {
    bg: 'bg-pink-100',
    text: 'text-pink-800',
    border: 'border-pink-200',
    icon: HiOutlineTable,
  },
  Trace: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200',
    icon: MdScatterPlot,
  },
  ExternalDashboard: {
    bg: 'bg-black-100',
    text: 'text-black-800',
    border: 'border-black-200',
    icon: FaExternalLinkAlt,
  },
  Alert: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
    icon: TbAlertCircle,
  },

  DuckdbSource: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    icon: SiDuckdb,
  },
  LocalMergeModel: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
    icon: MdOutlineTableView,
  },
  MysqlSource: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200',
    icon: TbBrandMysql,
  },
  BigQuerySource: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: SiGooglebigquery,
  },
  PostgresqlSource: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: SiPostgresql,
  },
  RedshiftSource: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
    icon: SiAmazonredshift,
  },
  SnowflakeSource: {
    bg: 'bg-cyan-100',
    text: 'text-cyan-800',
    border: 'border-cyan-200',
    icon: SiSnowflake,
  },
  SqlModel: {
    bg: 'bg-violet-100',
    text: 'text-violet-800',
    border: 'border-violet-200',
    icon: HiOutlineDatabase,
  },
  SqliteSource: {
    bg: 'bg-slate-100',
    text: 'text-slate-800',
    border: 'border-slate-200',
    icon: SiSqlite,
  },
  Project: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
    icon: FaGear,
  },
};
