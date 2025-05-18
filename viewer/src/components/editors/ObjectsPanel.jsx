import React, { useState, useMemo } from 'react';
import ObjectPill from './ObjectPill';
import useStore from '../../stores/store';
import Loading from '../common/Loading';
import { shallow } from 'zustand/shallow';
import { HiChevronLeft } from 'react-icons/hi';

const ObjectsPanel = ({ isCollapsed, onCollapse, onOpenCreateModal }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeKey, setSelectedTypeKey] = useState('');

  const isLoading = useStore(state => state.isLoading);
  const error = useStore(state => state.error);
  const namedChildrenAndType = useStore(state => state.namedChildren, shallow);

  const objectNames = useMemo(() => Object.keys(namedChildrenAndType), [namedChildrenAndType]);
  const uniqueTypes = useMemo(() => {
    const type_keys = [...new Set(Object.values(namedChildrenAndType).map(item => item.type_key))];
    return type_keys.sort();
  }, [namedChildrenAndType]);
  const filteredObjects = useMemo(() => {
    return objectNames.filter(name => {
      const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = !selectedTypeKey || namedChildrenAndType[name].type_key === selectedTypeKey;
      return matchesSearch && matchesType;
    });
  }, [objectNames, namedChildrenAndType, searchTerm, selectedTypeKey]);

  // Panel animation classes
  const panelClasses = `
    bg-white border-r border-gray-200 p-4 h-full flex flex-col relative
    transition-all duration-300 ease-in-out
    ${isCollapsed ? 'w-0 opacity-0 pointer-events-none overflow-hidden' : 'w-64 opacity-100 pointer-events-auto'}
  `;

  if (isLoading) {
    return <div className={panelClasses}><Loading text="Loading Project..." width={64} /></div>;
  }
  if (error) {
    return (
      <div className={panelClasses}>
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className={panelClasses}>
      {/* Collapse icon */}
      <button
        className="absolute top-6 right-5 text-primary-400 bg-primary-100 hover:text-gray-700 p-0 rounded-full transition-colors z-10"
        onClick={onCollapse}
        aria-label="Collapse Objects Panel"
        tabIndex={isCollapsed ? -1 : 0}
      >
        <HiChevronLeft className="w-6 h-6 mr-0" />
      </button>
      <input
        type="text"
        placeholder="Search objects..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 mr-4"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />
      <select
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        value={selectedTypeKey}
        onChange={e => setSelectedTypeKey(e.target.value)}
      >
        <option value="">All Types</option>
        {uniqueTypes.map(type => (
          <option key={type} value={type}>
            {type === 'na' ? 'Project' : type.charAt(0).toUpperCase() + type.slice(1)}
          </option>
        ))}
      </select>
      <div className="overflow-y-auto flex-1">
        {filteredObjects.length === 0 ? (
          <div className="text-gray-500 text-sm">No objects found</div>
        ) : (
          filteredObjects.map(name => (
            <div key={name} className="mb-2 mr-1 ml-1">
              <ObjectPill key={name} name={name} />
            </div>
          ))
        )}
      </div>
      {/* New create button section */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={onOpenCreateModal}
          className="w-full py-2 px-4 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] hover:scale-101 flex items-center justify-center"
        >
          <span className="mr-2">+</span>
          Create New Object
        </button>
      </div>
    </div>
  );
};

export default ObjectsPanel;
