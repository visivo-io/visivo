import React, { useState, useEffect } from "react";
import renderValue from "./renderValue";
import { HiPlus } from "react-icons/hi";
import AddItemModal from "./AddItemModal";
import useStore from "../../stores/store";
import ContextMenu from "./ContextMenu";

function ObjectComponent({ name, data, path }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const addObjectProperty = useStore(state => state.addObjectProperty);
  const [contextMenu, setContextMenu] = useState(null);
  const deleteNamedChildAttribute = useStore(
    (state) => state.deleteNamedChildAttribute
  );

  const handleAddProperty = ({ name: propertyName, value }) => {
    addObjectProperty(path, propertyName, value);
    setIsModalOpen(false);
  };

  // Filter and sort non-object entries
  const sortedNonObjectEntries = Object.entries(data)
    .filter(([_, value]) => typeof value !== "object" || value === null)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
  const sortedNonObject = Object.fromEntries(sortedNonObjectEntries);

  // Get the remaining entries (objects)
  const objectEntries = Object.entries(data)
    .filter(([_, value]) => typeof value === "object" && value !== null)
    .sort(([_, valueA], [__, valueB]) => {
      const keysCountA = Object.keys(valueA).length;
      const keysCountB = Object.keys(valueB).length;
      return keysCountB - keysCountA; // Sort descending (most keys first)
    });
  const sortedObject = Object.fromEntries(objectEntries);

  // Update the handler to match AttributeComponent
  const handleContextMenu = e => {
    e.preventDefault();
    e.stopPropagation(); // Add this to prevent event bubbling
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDelete = () => {
    console.log("Deleting path:", path); // Debug log
    deleteNamedChildAttribute(path);
    setContextMenu(null);
  };

  // Add useEffect for clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu]);

  return (
    <div
      className="flex flex-col p-1 rounded-md"
      onContextMenu={handleContextMenu}
    >
      <div className="flex justify-between items-center">
        {name && isNaN(parseInt(name)) && typeof name === "string" && (
          <div className="text-md font-medium pb-1 text-yellow-800">{name}</div>
        )}
        <button
          onClick={() => setIsModalOpen(true)}
          className="p-1 text-yellow-800 hover:text-yellow-900 rounded-full hover:bg-yellow-100"
        >
          <HiPlus className="h-5 w-5" />
        </button>
      </div>

      {/* Non-Object Section */}
      {Object.keys(sortedNonObject).length > 0 && (
        <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto w-full">
          {Object.entries(sortedNonObject).map(([key, value]) => {
            if (
              key === "changed" ||
              key === "path" ||
              key === "name" ||
              key === "__v"
            )
              return null;
            const childPath = [...path, key];
            return (
              <div
                key={key}
                className="border-gray-200 border bg-red-50 pl-2 pr-2 pb-2 mb-2 rounded-md text-"
                style={{
                  minWidth: "30px",
                  maxWidth: "400px",
                  flex: "1 0 auto",
                }}
              >
                {renderValue(key, value, childPath)}
              </div>
            );
          })}
        </div>
      )}

      {/* Object Section */}
      {Object.keys(sortedObject).length > 0 && (
        <div className="flex flex-wrap gap-4 w-full">
          {objectEntries.map(([key, value]) => {
            if (
              key === "changed" ||
              key === "path" ||
              key === "name" ||
              key === "__v"
            )
              return null;
            const childPath = [...path, key];
            const keyCount = Object.keys(value).length;
            const sizeFactor = Math.min(Math.max(keyCount * 270, 400), 1200);
            return (
              <div
                key={key}
                className="border-gray-400 border bg-blue-50 pb-2 pr-2 pl-2 rounded-lg shadow-xs"
                style={{ width: `${sizeFactor}px`, minWidth: "200px" }}
              >
                {renderValue(key, value, childPath)}
              </div>
            );
          })}
        </div>
      )}

      <AddItemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddProperty}
        isObjectMode={true}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default ObjectComponent;
