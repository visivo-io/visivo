import React from 'react';
import ObjectsPanel from './editors/ObjectsPanel';
import EditorPanel from './editors/EditorPanel';
import PreviewPanel from './editors/PreviewPanel';
import useStore from '../stores/store';

const Editor = () => {
  const projectData = useStore((state) => state.projectData);

  return (
    <div className="flex h-[calc(100vh-50px)] bg-gray-50 overflow-hidden">
      <ObjectsPanel />
      <div className="flex-1 flex flex-col overflow-hidden">
        <EditorPanel />
        <PreviewPanel 
          project={projectData}
        />   
      </div>
    </div>
  );
};

export default Editor; 