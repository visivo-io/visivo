import tw from 'tailwind-styled-components';

// Section container with vertical spacing
export const SectionContainer = tw.div`
  space-y-4
`;

// Section title with bottom border
export const SectionTitle = tw.h3`
  text-sm
  font-medium
  text-gray-700
  border-b
  border-gray-200
  pb-2
`;

// Alternative section title without border
export const SectionTitleNoBorder = tw.h3`
  text-sm
  font-medium
  text-gray-700
  mb-2
`;

// Form group container with spacing
export const FormGroup = tw.div`
  space-y-5
`;

// Form field spacing container
export const FieldGroup = tw.div`
  space-y-4
`;

// Inline form fields container (for horizontal layouts)
export const InlineFields = tw.div`
  flex
  gap-4
  items-start
`;

// Grid container for form fields
export const FieldGrid = tw.div`
  grid
  grid-cols-1
  gap-4
  ${p => p.$cols === 2 && 'md:grid-cols-2'}
  ${p => p.$cols === 3 && 'md:grid-cols-3'}
`;

// Card-like container for grouped content
export const Card = tw.div`
  bg-white
  border
  border-gray-200
  rounded-lg
  p-4
  space-y-4
`;

// Subtle background section
export const SubSection = tw.div`
  bg-gray-50
  rounded-md
  p-3
  space-y-3
`;

// Helper text below form fields
export const HelperText = tw.p`
  text-xs
  text-gray-500
  mt-1
`;

// Error text for form validation
export const ErrorText = tw.p`
  text-xs
  text-red-600
  mt-1
`;

// Warning text for form warnings
export const WarningText = tw.p`
  text-xs
  text-amber-600
  mt-1
`;

// Info text for additional information
export const InfoText = tw.p`
  text-xs
  text-blue-600
  mt-1
`;

// Divider between sections
export const Divider = tw.hr`
  border-gray-200
  my-4
`;

// Empty state container
export const EmptyState = tw.div`
  text-center
  py-6
  text-gray-500
  text-sm
`;

// List container for dynamic items
export const ListContainer = tw.div`
  space-y-2
`;

// Individual list item
export const ListItem = tw.div`
  flex
  items-center
  justify-between
  p-3
  bg-gray-50
  rounded-md
  hover:bg-gray-100
  transition-colors
`;

// Description list container
export const DescriptionList = tw.dl`
  space-y-3
`;

// Description term (label)
export const DescriptionTerm = tw.dt`
  text-sm
  font-medium
  text-gray-600
`;

// Description details (value)
export const DescriptionDetails = tw.dd`
  text-sm
  text-gray-900
  mt-1
`;

// Tab container
export const TabContainer = tw.div`
  border-b
  border-gray-200
`;

// Tab list
export const TabList = tw.nav`
  -mb-px
  flex
  space-x-4
`;

// Individual tab button
export const TabButton = tw.button`
  py-2
  px-1
  border-b-2
  font-medium
  text-sm
  ${p => p.$active
    ? 'border-primary-500 text-primary-600'
    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
`;

// Content container with padding
export const ContentContainer = tw.div`
  p-4
`;

// Scrollable container
export const ScrollableContainer = tw.div`
  overflow-y-auto
  max-h-96
`;

// Alert container
export const AlertContainer = tw.div`
  p-4
  rounded-md
  ${p => {
    switch(p.$type) {
      case 'error': return 'bg-red-50 border border-red-200';
      case 'warning': return 'bg-amber-50 border border-amber-200';
      case 'success': return 'bg-green-50 border border-green-200';
      case 'info': return 'bg-blue-50 border border-blue-200';
      default: return 'bg-gray-50 border border-gray-200';
    }
  }}
`;

// Alert text
export const AlertText = tw.p`
  text-sm
  ${p => {
    switch(p.$type) {
      case 'error': return 'text-red-800';
      case 'warning': return 'text-amber-800';
      case 'success': return 'text-green-800';
      case 'info': return 'text-blue-800';
      default: return 'text-gray-800';
    }
  }}
`;

const FormLayoutComponents = {
  SectionContainer,
  SectionTitle,
  SectionTitleNoBorder,
  FormGroup,
  FieldGroup,
  InlineFields,
  FieldGrid,
  Card,
  SubSection,
  HelperText,
  ErrorText,
  WarningText,
  InfoText,
  Divider,
  EmptyState,
  ListContainer,
  ListItem,
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
  TabContainer,
  TabList,
  TabButton,
  ContentContainer,
  ScrollableContainer,
  AlertContainer,
  AlertText
};

export default FormLayoutComponents;