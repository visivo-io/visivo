import React from 'react';
import tw from 'tailwind-styled-components';
import WorksheetTab from './WorksheetTab';
import WorksheetTabActions from './WorksheetTabActions';
import { useWorksheets } from '../../contexts/WorksheetContext';

const Container = tw.div`
  flex items-center border-b border-gray-200 bg-white px-4 overflow-x-auto min-h-[48px]
`;

const TabList = tw.div`
  flex flex-1 space-x-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent
`;

const WorksheetTabManager = ({
  worksheets,
  activeWorksheetId,
  onWorksheetSelect,
  onWorksheetCreate,
  onWorksheetOpen,
  onWorksheetRename,
  onWorksheetClose,
  isLoading,
}) => {
  const { actions } = useWorksheets();

  const handleWorksheetClose = worksheetId => {
    if (onWorksheetClose) {
      onWorksheetClose(worksheetId);
    } else {
      // Hide the worksheet instead of deleting it
      actions.updateWorksheet(worksheetId, { is_visible: false });

      // If we're closing the active worksheet, switch to another visible one
      if (worksheetId === activeWorksheetId) {
        const nextVisibleWorksheet = worksheets.find(w => w.id !== worksheetId && w.is_visible);
        if (nextVisibleWorksheet) {
          onWorksheetSelect(nextVisibleWorksheet.id);
        }
      }
    }
  };

  return (
    <Container>
      <TabList>
        {worksheets.map((worksheet, index) => (
          <WorksheetTab
            key={worksheet.id}
            worksheet={worksheet}
            index={index}
            isActive={worksheet.id === activeWorksheetId}
            onSelect={onWorksheetSelect}
            onClose={handleWorksheetClose}
            onRename={onWorksheetRename}
            isLoading={isLoading}
          />
        ))}
      </TabList>
      <div data-testid="worksheet-actions-container">
        <WorksheetTabActions
          onWorksheetCreate={onWorksheetCreate}
          onWorksheetOpen={onWorksheetOpen}
          isLoading={isLoading}
        />
      </div>
    </Container>
  );
};

export default WorksheetTabManager;
