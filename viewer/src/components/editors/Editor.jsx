import React from 'react';
import ObjectsPanel from './ObjectsPanel';
import EditorPanel from './editorPanel/EditorPanel';
import PreviewPanel from './PreviewPanel';
import Divider from '../explorer/Divider';
import CreateObjectModal from './CreateObjectModal';
import useStore from '../../stores/store';
import { HiPlus, HiChevronRight } from 'react-icons/hi';

const Editor = () => {
  const project = useStore(state => state.project);
  const [splitRatio, setSplitRatio] = React.useState(0.6);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isObjectsPanelCollapsed, setIsObjectsPanelCollapsed] = React.useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  const handleMouseDown = e => {
    setIsDragging(true);
    e.preventDefault();
  };

  React.useEffect(() => {
    const handleMouseMove = e => {
      if (!isDragging) return;
      const container = document.getElementById('editor-container');
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const containerHeight = containerRect.height;
      const mouseY = e.clientY - containerRect.top;
      const newRatio = Math.max(0.2, Math.min(0.8, mouseY / containerHeight));
      setSplitRatio(newRatio);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex h-[calc(100vh-50px)] bg-gray-50 overflow-hidden relative">
      <ObjectsPanel
        isCollapsed={isObjectsPanelCollapsed}
        onCollapse={() => setIsObjectsPanelCollapsed(true)}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
      />
      <div id="editor-container" className="flex-1 flex flex-col overflow-hidden">
        <div style={{ flex: splitRatio, minHeight: 0 }} className="flex flex-col overflow-hidden">
          <EditorPanel />
        </div>
        <Divider isDragging={isDragging} handleMouseDown={handleMouseDown} />
        <div style={{ flex: 1 - splitRatio, minHeight: 0 }} className="flex flex-col overflow-hidden">
          <PreviewPanel project={project} />
        </div>
      </div>
      {isObjectsPanelCollapsed && (
        <>
          {/* Floating expand button (top left) */}
          <button
            className="fixed top-15 left-1 z-50 bg-white border border-gray-300 shadow-lg text-[#713B57] hover:bg-gray-100 rounded-full p-3 flex items-center justify-center transition-colors group"
            onClick={() => setIsObjectsPanelCollapsed(false)}
            aria-label="Show Objects Panel"
          >
            <HiChevronRight className="w-6 h-6" />
            <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Show Objects Panel</span>
          </button>
          {/* Floating create button (bottom left) */}
          <button
            className="fixed bottom-6 left-6 z-50 bg-[#713B57] hover:bg-[#5A2F46] text-white rounded-full shadow-lg p-4 flex items-center justify-center transition-colors group"
            onClick={() => setIsCreateModalOpen(true)}
            aria-label="Create New Object"
          >
            <HiPlus className="w-7 h-7" />
            <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Create New Object</span>
          </button>
        </>
      )}
      <CreateObjectModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
};

export default Editor;
