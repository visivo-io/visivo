import React from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import tw from 'tailwind-styled-components';
import WorksheetTab from './WorksheetTab';
import WorksheetTabActions from './WorksheetTabActions';

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
  onWorksheetClose,
  onWorksheetCreate,
  onWorksheetOpen,
  onWorksheetReorder,
  isLoading
}) => {
  const handleDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }

    const newOrder = Array.from(worksheets);
    const [removed] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, removed);
    onWorksheetReorder(newOrder.map(w => w.id));
  };

  return (
    <Container>
      <TabList>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="worksheet-tabs" direction="horizontal">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                <div className="flex">
                  {worksheets.map((worksheet, index) => (
                    <Draggable
                      key={worksheet.id}
                      draggableId={`worksheet-${worksheet.id}`}
                      index={index}
                      isDragDisabled={isLoading}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <WorksheetTab
                            worksheet={worksheet}
                            index={index}
                            isActive={worksheet.id === activeWorksheetId}
                            onSelect={onWorksheetSelect}
                            onClose={onWorksheetClose}
                            isLoading={isLoading}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        </DragDropContext>
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