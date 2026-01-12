import StorageIcon from '@mui/icons-material/Storage';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CategoryIcon from '@mui/icons-material/Category';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import InsightsIcon from '@mui/icons-material/Insights';
import DescriptionIcon from '@mui/icons-material/Description';
import BarChartIcon from '@mui/icons-material/BarChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import TimelineIcon from '@mui/icons-material/Timeline';

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
    },
  },
  {
    value: 'trace',
    label: 'Traces',
    singularLabel: 'Trace',
    icon: TimelineIcon,
    enabled: false, // Traces are typically embedded, not created standalone
    colors: {
      bg: 'bg-rose-100',
      text: 'text-rose-800',
      border: 'border-rose-200',
      bgHover: 'hover:bg-rose-50',
      bgSelected: 'bg-rose-100',
      borderSelected: 'border-rose-300',
      // For nodes/pills
      node: 'bg-rose-50 border-rose-200',
      nodeSelected: 'bg-rose-100 border-rose-400',
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
  return (
    type?.colors || {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      border: 'border-gray-200',
      bgHover: 'hover:bg-gray-50',
      bgSelected: 'bg-gray-100',
      borderSelected: 'border-gray-300',
      node: 'bg-gray-50 border-gray-200',
      nodeSelected: 'bg-gray-100 border-gray-400',
    }
  );
};

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
};
