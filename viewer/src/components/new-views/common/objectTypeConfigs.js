import StorageIcon from '@mui/icons-material/Storage';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CategoryIcon from '@mui/icons-material/Category';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import InsightsIcon from '@mui/icons-material/Insights';
import DescriptionIcon from '@mui/icons-material/Description';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TerminalIcon from '@mui/icons-material/Terminal';
import MergeIcon from '@mui/icons-material/Merge';
import TuneIcon from '@mui/icons-material/Tune';
import SettingsIcon from '@mui/icons-material/Settings';

/**
 * Centralized object type definitions
 * Used by CreateButton, ObjectTypeFilter, ObjectList, and node components
 *
 * Each type includes:
 * - value: unique identifier
 * - label: plural display name
 * - singularLabel: singular display name
 * - icon: MUI icon component
 * - colors: Tailwind color classes for consistent styling
 *
 * Add new object types here as they become available
 */
export const OBJECT_TYPES = [
  {
    value: 'source',
    label: 'Sources',
    singularLabel: 'Source',
    icon: StorageIcon,
    enabled: true,
    colors: {
      bg: 'bg-teal-100',
      text: 'text-teal-800',
      border: 'border-teal-200',
      bgHover: 'hover:bg-teal-50',
      bgSelected: 'bg-teal-100',
      borderSelected: 'border-teal-300',
      // For nodes/pills
      node: 'bg-teal-50 border-teal-200',
      nodeSelected: 'bg-teal-100 border-teal-400',
      // For connection handles in lineage view
      connectionHandle: '#14b8a6', // teal-500
    },
  },
  {
    value: 'model',
    label: 'Models',
    singularLabel: 'Model',
    icon: ViewInArIcon,
    enabled: true,
    colors: {
      bg: 'bg-indigo-100',
      text: 'text-indigo-800',
      border: 'border-indigo-200',
      bgHover: 'hover:bg-indigo-50',
      bgSelected: 'bg-indigo-100',
      borderSelected: 'border-indigo-300',
      // For nodes/pills
      node: 'bg-indigo-50 border-indigo-200',
      nodeSelected: 'bg-indigo-100 border-indigo-400',
      // For connection handles in lineage view
      connectionHandle: '#6366f1', // indigo-500
    },
  },
  {
    value: 'dimension',
    label: 'Dimensions',
    singularLabel: 'Dimension',
    icon: CategoryIcon,
    enabled: true,
    colors: {
      bg: 'bg-purple-100',
      text: 'text-purple-800',
      border: 'border-purple-200',
      bgHover: 'hover:bg-purple-50',
      bgSelected: 'bg-purple-100',
      borderSelected: 'border-purple-300',
      // For nodes/pills
      node: 'bg-purple-50 border-purple-200',
      nodeSelected: 'bg-purple-100 border-purple-400',
      // For connection handles in lineage view
      connectionHandle: '#a855f7', // purple-500
    },
  },
  {
    value: 'metric',
    label: 'Metrics',
    singularLabel: 'Metric',
    icon: AnalyticsIcon,
    enabled: true,
    colors: {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      border: 'border-orange-200',
      bgHover: 'hover:bg-orange-50',
      bgSelected: 'bg-orange-100',
      borderSelected: 'border-orange-300',
      // For nodes/pills
      node: 'bg-orange-50 border-orange-200',
      nodeSelected: 'bg-orange-100 border-orange-400',
      // For connection handles in lineage view
      connectionHandle: '#f97316', // orange-500
    },
  },
  {
    value: 'relation',
    label: 'Relations',
    singularLabel: 'Relation',
    icon: AccountTreeIcon,
    enabled: true,
    colors: {
      bg: 'bg-cyan-100',
      text: 'text-cyan-800',
      border: 'border-cyan-200',
      bgHover: 'hover:bg-cyan-50',
      bgSelected: 'bg-cyan-100',
      borderSelected: 'border-cyan-300',
      // For nodes/pills
      node: 'bg-cyan-50 border-cyan-200',
      nodeSelected: 'bg-cyan-100 border-cyan-400',
      // For connection handles in lineage view
      connectionHandle: '#06b6d4', // cyan-500
    },
  },
  {
    value: 'insight',
    label: 'Insights',
    singularLabel: 'Insight',
    icon: InsightsIcon,
    enabled: true,
    colors: {
      bg: 'bg-pink-100',
      text: 'text-pink-800',
      border: 'border-pink-200',
      bgHover: 'hover:bg-pink-50',
      bgSelected: 'bg-pink-100',
      borderSelected: 'border-pink-300',
      // For nodes/pills
      node: 'bg-pink-50 border-pink-200',
      nodeSelected: 'bg-pink-100 border-pink-400',
      // For connection handles in lineage view
      connectionHandle: '#ec4899', // pink-500
    },
  },
  {
    value: 'markdown',
    label: 'Markdowns',
    singularLabel: 'Markdown',
    icon: DescriptionIcon,
    enabled: true,
    colors: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-200',
      bgHover: 'hover:bg-green-50',
      bgSelected: 'bg-green-100',
      borderSelected: 'border-green-300',
      // For nodes/pills
      node: 'bg-green-50 border-green-200',
      nodeSelected: 'bg-green-100 border-green-400',
      // For connection handles in lineage view
      connectionHandle: '#22c55e', // green-500
    },
  },
  {
    value: 'chart',
    label: 'Charts',
    singularLabel: 'Chart',
    icon: BarChartIcon,
    enabled: true,
    colors: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      border: 'border-blue-200',
      bgHover: 'hover:bg-blue-50',
      bgSelected: 'bg-blue-100',
      borderSelected: 'border-blue-300',
      // For nodes/pills
      node: 'bg-blue-50 border-blue-200',
      nodeSelected: 'bg-blue-100 border-blue-400',
      // For connection handles in lineage view
      connectionHandle: '#3b82f6', // blue-500
    },
  },
  {
    value: 'table',
    label: 'Tables',
    singularLabel: 'Table',
    icon: TableChartIcon,
    enabled: true,
    colors: {
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      border: 'border-amber-200',
      bgHover: 'hover:bg-amber-50',
      bgSelected: 'bg-amber-100',
      borderSelected: 'border-amber-300',
      // For nodes/pills
      node: 'bg-amber-50 border-amber-200',
      nodeSelected: 'bg-amber-100 border-amber-400',
      // For connection handles in lineage view
      connectionHandle: '#f59e0b', // amber-500
    },
  },
  {
    value: 'dashboard',
    label: 'Dashboards',
    singularLabel: 'Dashboard',
    icon: DashboardIcon,
    enabled: true,
    colors: {
      bg: 'bg-slate-100',
      text: 'text-slate-800',
      border: 'border-slate-200',
      bgHover: 'hover:bg-slate-50',
      bgSelected: 'bg-slate-100',
      borderSelected: 'border-slate-300',
      node: 'bg-slate-50 border-slate-200',
      nodeSelected: 'bg-slate-100 border-slate-400',
      connectionHandle: '#64748b', // slate-500
    },
  },
  {
    value: 'csvScriptModel',
    label: 'CSV Script Models',
    singularLabel: 'CSV Script Model',
    icon: TerminalIcon,
    enabled: true,
    colors: {
      bg: 'bg-violet-100',
      text: 'text-violet-800',
      border: 'border-violet-200',
      bgHover: 'hover:bg-violet-50',
      bgSelected: 'bg-violet-100',
      borderSelected: 'border-violet-300',
      node: 'bg-violet-50 border-violet-200',
      nodeSelected: 'bg-violet-100 border-violet-400',
      connectionHandle: '#8b5cf6', // violet-500
    },
  },
  {
    value: 'localMergeModel',
    label: 'Local Merge Models',
    singularLabel: 'Local Merge Model',
    icon: MergeIcon,
    enabled: true,
    colors: {
      bg: 'bg-fuchsia-100',
      text: 'text-fuchsia-800',
      border: 'border-fuchsia-200',
      bgHover: 'hover:bg-fuchsia-50',
      bgSelected: 'bg-fuchsia-100',
      borderSelected: 'border-fuchsia-300',
      node: 'bg-fuchsia-50 border-fuchsia-200',
      nodeSelected: 'bg-fuchsia-100 border-fuchsia-400',
      connectionHandle: '#d946ef', // fuchsia-500
    },
  },
  {
    value: 'input',
    label: 'Inputs',
    singularLabel: 'Input',
    icon: TuneIcon,
    enabled: true,
    colors: {
      bg: 'bg-lime-100',
      text: 'text-lime-800',
      border: 'border-lime-200',
      bgHover: 'hover:bg-lime-50',
      bgSelected: 'bg-lime-100',
      borderSelected: 'border-lime-300',
      node: 'bg-lime-50 border-lime-200',
      nodeSelected: 'bg-lime-100 border-lime-400',
      connectionHandle: '#84cc16', // lime-500
    },
  },
  {
    value: 'defaults',
    label: 'Project Settings',
    singularLabel: 'Project Settings',
    icon: SettingsIcon,
    enabled: false,
    colors: {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      border: 'border-gray-200',
      bgHover: 'hover:bg-gray-50',
      bgSelected: 'bg-gray-100',
      borderSelected: 'border-gray-300',
      node: 'bg-gray-50 border-gray-200',
      nodeSelected: 'bg-gray-100 border-gray-400',
      connectionHandle: '#6b7280', // gray-500
    },
  },
];

/**
 * Get only enabled object types (for create menu)
 */
export const getEnabledTypes = () => OBJECT_TYPES.filter(t => t.enabled);

/**
 * Get object type by value
 */
export const getTypeByValue = value => OBJECT_TYPES.find(t => t.value === value);

/**
 * Default colors for unknown types
 */
export const DEFAULT_COLORS = {
  bg: 'bg-gray-100',
  text: 'text-gray-800',
  border: 'border-gray-200',
  bgHover: 'hover:bg-gray-50',
  bgSelected: 'bg-gray-100',
  borderSelected: 'border-gray-300',
  node: 'bg-gray-50 border-gray-200',
  nodeSelected: 'bg-gray-100 border-gray-400',
  connectionHandle: '#6b7280', // gray-500
};

/**
 * Get icon component for an object type
 */
export const getTypeIcon = value => {
  const type = getTypeByValue(value);
  return type?.icon || StorageIcon;
};

/**
 * Get color classes for an object type
 * Returns default gray colors if type not found
 */
export const getTypeColors = value => {
  const type = getTypeByValue(value);
  return type?.colors || DEFAULT_COLORS;
};
