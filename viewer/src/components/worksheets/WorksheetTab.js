import React from 'react';
import { Draggable } from 'react-beautiful-dnd';
import tw from 'tailwind-styled-components';
import CloseIcon from '@mui/icons-material/Close';

const Tab = tw.div`
  flex items-center px-3 py-2 rounded-t-lg cursor-pointer hover:bg-gray-50
`;

const ActiveTab = tw(Tab)`
  active-tab text-gray-900 bg-white border-t border-l border-r border-gray-200
`;

const InactiveTab = tw(Tab)`
  inactive-tab text-gray-500 hover:text-gray-700
`;

const TabContent = tw.div`
  flex items-center space-x-2
`;

const TabText = tw.span`
  truncate
`;

const CloseButton = tw.button`
  p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity
`;

const WorksheetTab = ({
  worksheet,
  index,
  isActive,
  onSelect,
  onClose,
  isLoading
}) => {
  const handleClose = (e) => {
    e.stopPropagation();
    onClose(worksheet.id);
  };

  const handleSelect = () => {
    onSelect(worksheet.id);
  };

  const TabComponent = isActive ? ActiveTab : InactiveTab;

  return (
    <Draggable
      draggableId={`worksheet-${worksheet.id}`}
      index={index}
      isDragDisabled={isLoading}
    >
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          data-testid={`worksheet-tab-${worksheet.id}`}
          onClick={handleSelect}
          className="group"
        >
          <TabComponent>
            <TabContent>
              <TabText
                data-testid={`tab-text-${worksheet.id}`}
                style={{ maxWidth: '200px' }}
              >
                {worksheet.name}
              </TabText>
              <CloseButton
                data-testid={`close-tab-${worksheet.id}`}
                onClick={handleClose}
                aria-label="Close worksheet"
              >
                <CloseIcon fontSize="small" />
              </CloseButton>
            </TabContent>
          </TabComponent>
        </div>
      )}
    </Draggable>
  );
};

export default WorksheetTab; 