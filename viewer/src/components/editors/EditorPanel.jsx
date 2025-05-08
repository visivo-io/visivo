import React from 'react';
import { HiX, HiDotsVertical } from 'react-icons/hi';
import ObjectComponent from './ObjectComponent';
import SaveChangesModal from './SaveChangesModal';
import useStore from '../../stores/store';
import MoveObjectModal from './MoveObjectModal';
import DeleteObjectModal from './DeleteObjectModal';
import TextEditorModal from './TextEditorModal';

// Split into smaller, more focused selectors
const selectTabs = state => state.tabs;
const selectActiveTabId = state => state.activeTabId;
const selectNamedChildren = state => state.namedChildren;

const EditorPanel = () => {
  // Get basic tab state
  const tabs = useStore(selectTabs);
  const activeTabId = useStore(selectActiveTabId);
  const namedChildren = useStore(selectNamedChildren);

  // Get actions directly
  const setActiveTab = useStore(state => state.setActiveTab);
  const closeTab = useStore(state => state.closeTab);

  // Add state for modal
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Add new state for modals and menu
  const [isMoveModalOpen, setIsMoveModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isTextEditorModalOpen, setIsTextEditorModalOpen] = React.useState(false);

  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) : null;
  const activeConfig = activeTab && namedChildren[activeTab.name]?.config;

  // Add ref for scroll container
  const scrollRef = React.useRef(null);
  const [scrollPosition, setScrollPosition] = React.useState(0);

  // Save scroll position before update
  const handleScroll = React.useCallback(() => {
    if (scrollRef.current) {
      setScrollPosition(scrollRef.current.scrollTop);
    }
  }, []);

  // Restore scroll position after update
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition, activeConfig]);

  const handleDelete = () => {
    if (!activeTab) return;

    // Update the store
    useStore.setState({
      namedChildren: {
        ...namedChildren,
        [activeTab.name]: {
          ...namedChildren[activeTab.name],
          status: 'Deleted',
        },
      },
    });

    // Close the current tab and modal
    closeTab(activeTab.id);
    setIsDeleteModalOpen(false);
  };

  return (
    <div className="flex-1 bg-white border-b border-gray-200 p-2 overflow-hidden flex flex-col min-h-0">
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex space-x-1 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center px-4 py-2 rounded-t-lg  cursor-pointer border-b-2 ${
                activeTabId === tab.id
                  ? 'text-blue-600 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 border-transparent'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="text-sm font-medium truncate max-w-xs">{tab.name}</span>
              <button
                className="ml-2 p-1 hover:bg-blue-100 rounded-xs"
                onClick={e => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <HiX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="pl-2 pb-4 flex items-center space-x-2">
          {/* Only show kebab menu when there's an active tab */}
          {activeTabId && (
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <HiDotsVertical className="w-5 h-5 text-gray-600" />
              </button>

              {/* Dropdown menu */}
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <ul className="py-2">
                    <li>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsTextEditorModalOpen(true);
                        }}
                        className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100"
                      >
                        Open in Text Editor
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsMoveModalOpen(true);
                        }}
                        className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100"
                      >
                        Move Object
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsDeleteModalOpen(true);
                        }}
                        className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100"
                      >
                        Delete Object
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] hover:scale-101 flex items-center"
          >
            View Changes
          </button>
        </div>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0">
        {activeTabId && activeConfig ? (
          <ObjectComponent key={activeTab.name} data={activeConfig} path={[activeTab.name]} />
        ) : (
          <div className="text-gray-500 text-sm text-center mt-8">
            Double-click an object from the left panel to edit its configuration
          </div>
        )}
      </div>

      <MoveObjectModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        objectName={activeTab?.name}
        currentPath={activeTab?.name ? namedChildren[activeTab.name]?.file_path : ''}
      />

      <DeleteObjectModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        objectName={activeTab?.name}
        onConfirm={handleDelete}
      />

      <TextEditorModal
        isOpen={isTextEditorModalOpen}
        onClose={() => setIsTextEditorModalOpen(false)}
        objectName={activeTab?.name}
      />

      <SaveChangesModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

export default EditorPanel;
