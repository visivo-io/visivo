import React, { useState, useMemo } from "react";
import ObjectPill from "./ObjectPill";
import useStore from "../../stores/store";
import Loading from "../common/Loading";
import { shallow } from "zustand/shallow";
import CreateObjectModal from "./CreateObjectModal";

const ObjectsPanel = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTypeKey, setSelectedTypeKey] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Use the store for state management
  const isLoading = useStore(state => state.isLoading);
  const error = useStore(state => state.error);

  const namedChildrenAndType = useStore(state => state.namedChildren, shallow);

  const objectNames = useMemo(() => {
    return Object.keys(namedChildrenAndType);
  }, [namedChildrenAndType]);

  const uniqueTypes = useMemo(() => {
    const type_keys = [
      ...new Set(
        Object.values(namedChildrenAndType).map((item) => item.type_key)
      ),
    ];
    return type_keys.sort();
  }, [namedChildrenAndType]);

  const filteredObjects = useMemo(() => {
    return objectNames.filter((name) => {
      const matchesSearch = name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesType =
        !selectedTypeKey ||
        namedChildrenAndType[name].type_key === selectedTypeKey;
      return matchesSearch && matchesType;
    });
  }, [objectNames, namedChildrenAndType, searchTerm, selectedTypeKey]);

  if (isLoading) {
    return <Loading text="Loading Project..." width={64} />;
  }

  if (error) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 p-4 h-full">
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 h-full flex flex-col">
      <input
        type="text"
        placeholder="Search objects..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
      />
      <select
        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
        value={selectedTypeKey}
        onChange={e => setSelectedTypeKey(e.target.value)}
      >
        <option value="">All Types</option>
        {uniqueTypes.map((type) => (
          <option key={type} value={type}>
            {type === "na"
              ? "Project"
              : type.charAt(0).toUpperCase() + type.slice(1)}
          </option>
        ))}
      </select>
      <div className="overflow-y-auto flex-1">
        {filteredObjects.length === 0 ? (
          <div className="text-gray-500 text-sm">No objects found</div>
        ) : (
          filteredObjects.map((name) => (
            <div key={name} className="mb-2 mr-1 ml-1">
              <ObjectPill key={name} name={name} />
            </div>
          ))
        )}
      </div>

      {/* New create button section */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="w-full py-2 px-4 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] hover:scale-101 flex items-center justify-center"
        >
          <span className="mr-2">+</span>
          Create New Object
        </button>
      </div>

      <CreateObjectModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  );
};

export default ObjectsPanel;
