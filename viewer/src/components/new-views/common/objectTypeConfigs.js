import StorageIcon from '@mui/icons-material/Storage';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CategoryIcon from '@mui/icons-material/Category';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AccountTreeIcon from '@mui/icons-material/AccountTree';

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
