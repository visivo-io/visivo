import React from 'react';
import ObjectsPanel from './editor/ObjectsPanel';
import EditorPanel from './editor/EditorPanel';
import PreviewPanel from './editor/PreviewPanel';

const Editor = () => {
  return (
    <div className="flex h-screen bg-gray-50">
      <ObjectsPanel />
      <div className="flex-1 flex flex-col">
        <EditorPanel />
        <PreviewPanel />
      </div>
    </div>
  );
};

export default Editor; 