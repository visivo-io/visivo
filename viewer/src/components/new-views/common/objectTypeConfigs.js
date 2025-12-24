import StorageIcon from '@mui/icons-material/Storage';
import ViewInArIcon from '@mui/icons-material/ViewInAr';

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
