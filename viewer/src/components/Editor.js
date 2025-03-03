import React, { useState, useCallback, useEffect } from 'react';
import ObjectsPanel from './editors/ObjectsPanel';
import EditorPanel from './editors/EditorPanel';
import PreviewPanel from './editors/PreviewPanel';
import useStore from '../stores/store';

const Editor = () => {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const projectData = useStore((state) => state.projectData);
  const setProjectData = useStore((state) => state.setProjectData);

  // Load project data when component mounts
  useEffect(() => {
    const fetchProjectData = async () => {
      try {
        const response = await fetch('/data/project.json');
        if (!response.ok) {
          throw new Error('Failed to fetch project data');
        }
        const data = await response.json();
        setProjectData(data); // Update the store
      } catch (error) {
        console.error('Error fetching project data:', error);
      }
    };

    fetchProjectData();
  }, []);

  const handleObjectOpen = useCallback((object) => {
    // Check if tab already exists
    const existingTab = tabs.find(tab => tab.name === object.name);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    // Create new tab
    const newTab = {
      id: `${object.type}-${object.name}-${Date.now()}`,
      name: object.name,
      type: object.type,
      config: object.config
    };

    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs]);

  const handleTabChange = useCallback((tab) => {
    setActiveTabId(tab.id);
  }, []);

  const handleTabClose = useCallback((tabId) => {
    setTabs(prevTabs => prevTabs.filter(tab => tab.id !== tabId));
    if (activeTabId === tabId) {
      const remainingTabs = tabs.filter(tab => tab.id !== tabId);
      setActiveTabId(remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null);
    }
  }, [tabs, activeTabId]);

  const handleConfigChange = useCallback((tabId, newConfig) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, config: newConfig }
          : tab
      )
    );
  }, []);

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  return (
    <div className="flex h-[calc(100vh-50px)] bg-gray-50 overflow-hidden">
      <ObjectsPanel onObjectOpen={handleObjectOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
          <EditorPanel
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabClose={handleTabClose}
            onConfigChange={handleConfigChange}
          />
          <PreviewPanel 
            activeObject={activeTab ? {
              type: activeTab.type,
              name: activeTab.name,
              config: activeTab.config
            } : null}
            project={projectData}
          />   
      </div>
    </div>
  );
};

export default Editor; 