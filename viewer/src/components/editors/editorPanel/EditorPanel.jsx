import React, { useState, useEffect, useRef, useCallback } from 'react';
import useStore from '../../../stores/store';
import TabBar from './TabBar';
import ActionButtons from './ActionButtons';
import EditorContent from './EditorContent';
import SaveChangesModal from './modals/SaveChangesModal';
import MoveObjectModal from './modals/MoveObjectModal';
import DeleteObjectModal from './modals/DeleteObjectModal';
import TextEditorModal from './modals/TextEditorModal';
import SnackBar from '../../common/SnackBar';

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

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTextEditorModalOpen, setIsTextEditorModalOpen] = useState(false);

  const [snackBarOpen, setSnackBarOpen] = useState(false);
  const [message, setMessage] = useState('');

  const activeTab = activeTabId ? tabs.find(tab => tab.id === activeTabId) : null;
  const activeConfig = activeTab && namedChildren[activeTab.name]?.config;

  // Add ref for scroll container
  const scrollRef = useRef(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Save scroll position before update
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollPosition(scrollRef.current.scrollTop);
    }
  }, []);

  // Restore scroll position after update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition, activeConfig]);

  useEffect(() => {
    if (!snackBarOpen) {
      setMessage('');
    }
  }, [snackBarOpen]);

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
      <div className="flex items-center border-b border-gray-200">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          setActiveTab={setActiveTab}
          closeTab={closeTab}
        />
        <ActionButtons
          activeTabId={activeTabId}
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
          setIsTextEditorModalOpen={setIsTextEditorModalOpen}
          setIsMoveModalOpen={setIsMoveModalOpen}
          setIsDeleteModalOpen={setIsDeleteModalOpen}
          setIsModalOpen={setIsModalOpen}
        />
      </div>

      <EditorContent
        scrollRef={scrollRef}
        handleScroll={handleScroll}
        activeTabId={activeTabId}
        activeConfig={activeConfig}
        activeTab={activeTab}
      />

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
        setMessage={setMessage}
        setSnackBarOpen={setSnackBarOpen}
      />

      <SaveChangesModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <SnackBar open={snackBarOpen} setOpen={setSnackBarOpen} message={message} />
    </div>
  );
};

export default EditorPanel;
