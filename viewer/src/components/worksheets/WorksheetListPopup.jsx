import React, { useState } from 'react';
import tw from 'tailwind-styled-components';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

const PopupOverlay = tw.div`
  fixed inset-0 backdrop z-50 flex items-center justify-center
`;

const PopupContent = tw.div`
  bg-white rounded-lg shadow-xl w-[500px] max-h-[600px] flex flex-col
`;

const Header = tw.div`
  p-4 border-b border-gray-200
`;

const SearchContainer = tw.div`
  relative
`;

const SearchInput = tw.input`
  w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg
  focus:outline-hidden focus:ring-2 focus:ring-blue-500
`;

const SearchIconWrapper = tw.div`
  absolute left-3 top-1/2 -translate-y-1/2 text-gray-400
`;

const WorksheetList = tw.div`
  flex-1 overflow-y-auto p-2
`;

const WorksheetItem = tw.div`
  flex items-center justify-between p-3 rounded-lg cursor-pointer group transition-all duration-200
  ${props => (props.$isVisible ? 'bg-gray-50' : 'bg-white')}
  ${props => (props.$isActive ? 'bg-gray-100' : '')}
  hover:bg-gray-100
`;

const WorksheetName = tw.span`
  flex-1 truncate mr-4
`;

const ActionButtons = tw.div`
  flex items-center gap-2
`;

const IconButton = tw.button`
  p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity
  text-gray-400 hover:text-gray-600
`;

const VisibilityIndicator = tw.div`
  p-1 text-gray-400
`;

const WorksheetListPopup = ({
  worksheets,
  activeWorksheetId,
  onSelect,
  onClose,
  onToggleVisibility,
  onDelete,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingIds, setDeletingIds] = useState(new Set());

  const filteredWorksheets = worksheets
    .filter(worksheet => !deletingIds.has(worksheet.id))
    .filter(worksheet => worksheet.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSelect = async worksheet => {
    try {
      // If the worksheet is already visible, just select it and close the popup
      if (worksheet.is_visible) {
        onSelect(worksheet.id);
        onClose();
        return;
      }

      // If worksheet is not visible, make it visible and update its state
      await onToggleVisibility(worksheet.id, true);

      // Select the worksheet (this will trigger the useEffect in QueryExplorer
      // that loads the worksheet's query and results)
      onSelect(worksheet.id);
      onClose();
    } catch (err) {
      console.error('Error selecting worksheet:', err);
    }
  };

  const handleDelete = async (e, worksheetId) => {
    e.stopPropagation();
    setDeletingIds(prev => new Set([...prev, worksheetId]));

    // Wait for animation to complete before deleting
    try {
      // Start animation
      const animationDuration = 300; // matches the CSS animation duration
      await new Promise(resolve => setTimeout(resolve, animationDuration));

      // Delete worksheet
      await onDelete(worksheetId);
    } catch (err) {
      console.error('Error deleting worksheet:', err);
      // Remove from deleting state if there's an error
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(worksheetId);
        return next;
      });
    }
  };

  return (
    <PopupOverlay onClick={onClose}>
      <PopupContent onClick={e => e.stopPropagation()}>
        <Header>
          <h2 className="text-lg font-semibold mb-3">Open Worksheet</h2>
          <SearchContainer>
            <SearchIconWrapper>
              <SearchIcon fontSize="small" />
            </SearchIconWrapper>
            <SearchInput
              type="text"
              placeholder="Search worksheets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </SearchContainer>
        </Header>
        <WorksheetList>
          {filteredWorksheets.map(worksheet => (
            <WorksheetItem
              key={worksheet.id}
              $isVisible={worksheet.is_visible}
              $isActive={worksheet.id === activeWorksheetId}
              onClick={() => handleSelect(worksheet)}
              className={`${deletingIds.has(worksheet.id) ? 'animate-fadeOutLeft' : ''}`}
            >
              <WorksheetName>{worksheet.name}</WorksheetName>
              <ActionButtons>
                <VisibilityIndicator>
                  {worksheet.is_visible && <VisibilityIcon fontSize="small" />}
                </VisibilityIndicator>
                <IconButton
                  onClick={e => handleDelete(e, worksheet.id)}
                  aria-label="Delete worksheet"
                  disabled={deletingIds.has(worksheet.id)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </ActionButtons>
            </WorksheetItem>
          ))}
          {filteredWorksheets.length === 0 && (
            <div className="text-center text-gray-500 py-4">No worksheets found</div>
          )}
        </WorksheetList>
      </PopupContent>
    </PopupOverlay>
  );
};

export default WorksheetListPopup;
