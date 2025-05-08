import {
  HiOutlineChartBar,
  HiOutlineViewGrid,
  HiOutlineSelector,
  HiOutlineTable,
} from 'react-icons/hi';
import { MdScatterPlot } from 'react-icons/md';
import { TbAlertCircle, TbSourceCode } from 'react-icons/tb';
import { BiData } from 'react-icons/bi';
import { AiOutlineDeploymentUnit } from 'react-icons/ai';

export const PROPERTY_STYLE_MAP = {
  sources: {
    displayName: 'Source',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: TbSourceCode,
    description: 'Create a new data source connection',
  },
  models: {
    displayName: 'Model',
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: BiData,
    description: 'Create a new data model',
  },
  traces: {
    displayName: 'Trace',
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200',
    icon: MdScatterPlot,
    description: 'Create a new trace visualization',
  },
  charts: {
    displayName: 'Chart',
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: HiOutlineChartBar,
    description: 'Create a new chart visualization',
  },
  tables: {
    displayName: 'Table',
    bg: 'bg-pink-100',
    text: 'text-pink-800',
    border: 'border-pink-200',
    icon: HiOutlineTable,
    description: 'Create a new table view',
  },
  selectors: {
    displayName: 'Selector',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    icon: HiOutlineSelector,
    description: 'Create a new data selector',
  },
  dashboards: {
    displayName: 'Dashboard',
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
    icon: HiOutlineViewGrid,
    description: 'Create a new dashboard',
  },
  alerts: {
    displayName: 'Alert',
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
    icon: TbAlertCircle,
    description: 'Create a new alert',
  },
  destinations: {
    displayName: 'Destination',
    bg: 'bg-cyan-100',
    text: 'text-cyan-800',
    border: 'border-cyan-200',
    icon: AiOutlineDeploymentUnit,
    description: 'Create a new alert destination',
  },
};
