import React, { useState, useCallback } from 'react';
import ObjectsPanel from './editor/ObjectsPanel';
import EditorPanel from './editor/EditorPanel';
import PreviewPanel from './editor/PreviewPanel';

const Editor = () => {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [project, setProject] = useState(null);

  // Load project data when component mounts
  React.useEffect(() => {
    const loadProject = async () => {
      const response = await fetch('/data/project.json');
      if (response.ok) {
        const data = await response.json();
        setProject(data);
      }
    };
    loadProject();
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
          project={project}
        />
      </div>
    </div>
  );
};

export default Editor; 