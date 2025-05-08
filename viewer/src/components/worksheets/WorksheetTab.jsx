import React, { useState, useRef, useEffect } from 'react';
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

const TabInput = tw.input`
  px-1 py-0.5 border border-gray-300 rounded text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500
`;

const CloseButton = tw.button`
  p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity
`;

const WorksheetTab = ({ worksheet, index, isActive, onSelect, onClose, onRename, isLoading }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(worksheet.name);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClose = e => {
    e.stopPropagation();
    onClose(worksheet.id);
  };

  const handleSelect = () => {
    if (!isEditing) {
      onSelect(worksheet.id);
    }
  };

  const handleDoubleClick = e => {
    e.stopPropagation();
    if (!isLoading) {
      setIsEditing(true);
    }
  };

  const handleInputChange = e => {
    setEditValue(e.target.value);
  };

  const handleInputBlur = () => {
    handleRename();
  };

  const handleInputKeyDown = e => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(worksheet.name);
    }
  };

  const handleRename = () => {
    const newName = editValue.trim();
    if (newName && newName !== worksheet.name) {
      onRename(worksheet.id, newName);
    }
    setIsEditing(false);
  };

  const TabComponent = isActive ? ActiveTab : InactiveTab;

  return (
    <div data-testid={`worksheet-tab-${worksheet.id}`} onClick={handleSelect} className="group">
      <TabComponent>
        <TabContent>
          {isEditing ? (
            <TabInput
              ref={inputRef}
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '200px' }}
            />
          ) : (
            <TabText
              data-testid={`tab-text-${worksheet.id}`}
              style={{ maxWidth: '200px' }}
              onDoubleClick={handleDoubleClick}
            >
              {worksheet.name}
            </TabText>
          )}
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
  );
};

export default WorksheetTab;
