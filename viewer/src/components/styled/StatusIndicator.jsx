import React from 'react';
import tw from 'tailwind-styled-components';
import { ObjectStatus } from '../../stores/store';

// Styled component for the status indicator dot
const StyledIndicator = tw.span`
  absolute
  -top-1.5
  -left-1.5
  w-3
  h-3
  rounded-full
  z-10
  border-2
  border-white
  ${p => p.$status === ObjectStatus.NEW ? 'bg-green-500' : 'bg-amber-500'}
`;

/**
 * StatusIndicator - Shows the publish status of an object
 *
 * @param {ObjectStatus} status - The status of the object (NEW, MODIFIED, or PUBLISHED)
 * @returns {JSX.Element|null} - Returns null if status is PUBLISHED or not provided
 */
export const StatusIndicator = ({ status }) => {
  if (!status || status === ObjectStatus.PUBLISHED) {
    return null;
  }

  const title = status === ObjectStatus.NEW
    ? 'New - Not yet published'
    : 'Modified - Has unpublished changes';

  return (
    <StyledIndicator
      $status={status}
      title={title}
    />
  );
};

export default StatusIndicator;