import React, { useEffect } from 'react';
import ObjectsPanel from './editors/ObjectsPanel';
import EditorPanel from './editors/EditorPanel';
import PreviewPanel from './editors/PreviewPanel';
import useStore from '../stores/store';

const Editor = () => {
  // Get state and actions from store
  VITE_APP_API_BASE_URL('Editor render');
  const projectData = useStore((state) => state.projectData);
  const setProjectData = useStore((state) => state.setProjectData);
  const fetchNamedChildren = useStore((state) => state.fetchNamedChildren);


  // Load project data when component mounts
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const response = await fetch('/data/project.json');
        if (!response.ok) {
          throw new Error('Failed to fetch project data');
        }
        const data = await response.json();
        setProjectData(data);
      } catch (error) {
        console.error('Error fetching project data:', error);
      }
    };

    fetchProjectData();
    fetchNamedChildren();
  }, [fetchNamedChildren, setProjectData]);


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