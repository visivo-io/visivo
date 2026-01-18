import React from 'react';
import tw from 'tailwind-styled-components';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';

// Base styled button component
const StyledBackButton = tw.button`
  w-full
  flex
  items-center
  gap-2
  px-3
  py-2
  mb-4
  rounded-md
  border
  transition-colors
  ${p => p.$colors?.node || 'bg-gray-50 border-gray-200'}
  ${p => p.$colors?.bgHover || 'hover:bg-gray-100'}
`;

const StyledButtonText = tw.span`
  text-sm
  font-medium
  ${p => p.$textColor || 'text-gray-700'}
`;

/**
 * BackNavigationButton - A styled component for back navigation in edit forms
 * @param {Function} onClick - Click handler for navigation
 * @param {Object} typeConfig - Configuration object from objectTypeConfigs
 * @param {string} label - Label text (e.g., "Model", "Insight")
 * @param {string} name - Name of the parent object
 */
export const BackNavigationButton = ({ onClick, typeConfig, label, name }) => {
  const Icon = typeConfig?.icon;
  const colors = typeConfig?.colors;
  const textColor = colors?.text;

  return (
    <StyledBackButton
      type="button"
      onClick={onClick}
      $colors={colors}
    >
      <ChevronLeftIcon
        fontSize="small"
        className={textColor || 'text-gray-600'}
      />
      {Icon && (
        <Icon
          fontSize="small"
          className={textColor || 'text-gray-600'}
        />
      )}
      <StyledButtonText $textColor={textColor}>
        {label} {name}
      </StyledButtonText>
    </StyledBackButton>
  );
};

export default BackNavigationButton;