import React, { useState } from 'react';
import tw from 'tailwind-styled-components';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import WorksheetListPopup from './WorksheetListPopup';
import useStore from '../../stores/store';

const Container = tw.div`
  flex items-center space-x-2
`;

const ActionButton = tw.button`
  p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed
`;

const WorksheetTabActions = ({ onWorksheetCreate, onWorksheetOpen, isLoading }) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const {
    allWorksheets,
    activeWorksheetId,
    setActiveWorksheet,
    updateWorksheetData,
    deleteWorksheetById,
  } = useStore();

  const handleCreate = e => {
    onWorksheetCreate();
  };

  const handleOpen = e => {
    setIsPopupOpen(true);
    if (onWorksheetOpen) {
      onWorksheetOpen();
    }
  };

  return (
    <>
      <Container>
        <ActionButton
          data-testid="create-worksheet"
          onClick={handleCreate}
          disabled={isLoading}
          aria-label="Create new worksheet"
        >
          <AddIcon fontSize="small" />
        </ActionButton>
        <ActionButton
          data-testid="open-worksheet"
          onClick={handleOpen}
          disabled={isLoading}
          aria-label="Open worksheet"
        >
          <FolderOpenIcon fontSize="small" />
        </ActionButton>
      </Container>

      {isPopupOpen && (
        <WorksheetListPopup
          worksheets={allWorksheets}
          activeWorksheetId={activeWorksheetId}
          onSelect={setActiveWorksheet}
          onClose={() => setIsPopupOpen(false)}
          onToggleVisibility={(id, isVisible) => updateWorksheetData(id, { is_visible: isVisible })}
          onDelete={deleteWorksheetById}
        />
      )}
    </>
  );
};

export default WorksheetTabActions;
