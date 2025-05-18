import React from 'react';
import ObjectsPanel from './ObjectsPanel';
import EditorPanel from './editorPanel/index';
import PreviewPanel from './PreviewPanel';
import Divider from '../explorer/Divider';
import useStore from '../../stores/store';

const Editor = () => {
  const project = useStore(state => state.project);
  const [splitRatio, setSplitRatio] = React.useState(0.6);
  const [isDragging, setIsDragging] = React.useState(false);

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

      // Calculate ratio (constrain between 0.2 and 0.8)
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
    <div className="flex h-[calc(100vh-50px)] bg-gray-50 overflow-hidden">
      <ObjectsPanel />
      <div id="editor-container" className="flex-1 flex flex-col overflow-hidden">
        <div style={{ flex: splitRatio, minHeight: 0 }} className="flex flex-col overflow-hidden">
          <EditorPanel />
        </div>
        <Divider isDragging={isDragging} handleMouseDown={handleMouseDown} />
        <div style={{ flex: 1 - splitRatio, minHeight: 0 }} className="flex flex-col overflow-hidden">
          <PreviewPanel project={project} />
        </div>
      </div>
    </div>
  );
};

export default Editor;
