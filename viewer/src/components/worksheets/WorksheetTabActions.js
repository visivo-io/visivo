import React from 'react';
import tw from 'tailwind-styled-components';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';

const Container = tw.div`
  flex items-center space-x-2
`;

const ActionButton = tw.button`
  p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
`;

const WorksheetTabActions = ({
  onWorksheetCreate,
  onWorksheetOpen,
  isLoading
}) => {
  return (
    <Container>
      <ActionButton
        data-testid="create-worksheet"
        onClick={onWorksheetCreate}
        disabled={isLoading}
        aria-label="Create new worksheet"
      >
        <AddIcon fontSize="small" />
      </ActionButton>
      <ActionButton
        data-testid="open-worksheet"
        onClick={onWorksheetOpen}
        disabled={isLoading}
        aria-label="Open worksheet"
      >
        <FolderOpenIcon fontSize="small" />
      </ActionButton>
    </Container>
  );
};

export default WorksheetTabActions; 