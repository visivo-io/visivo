import React, { useState } from 'react';
import useStore from '../../../../stores/store';


const MoveObjectModal = ({ isOpen, onClose, objectName, currentPath }) => {
  const projectFileObjects = useStore(state => state.projectFileObjects);
  const namedChildren = useStore(state => state.namedChildren);
  const [selectedPath, setSelectedPath] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [isCustomPath, setIsCustomPath] = useState(false);

  const handleMove = () => {
    const newPath = isCustomPath ? customPath : selectedPath;
    if (!newPath) return;

    // Update the namedChildren store
    useStore.setState({
      namedChildren: {
        ...namedChildren,
        [objectName]: {
          ...namedChildren[objectName],
          status: 'Moved',
          new_file_path: newPath,
        },
      },
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Move Object</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Moving: <span className="font-medium">{objectName}</span>
          </p>
          <p className="text-sm text-gray-600 mb-4">
            Current location: <span className="font-medium">{currentPath}</span>
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center mb-2">
              <input
                type="radio"
                checked={!isCustomPath}
                onChange={() => setIsCustomPath(false)}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">Select existing location</span>
            </label>
            <select
              value={selectedPath}
              onChange={e => setSelectedPath(e.target.value)}
              disabled={isCustomPath}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 disabled:bg-gray-100"
            >
              <option value="">Select a location...</option>
              {projectFileObjects.map(pathObj => (
                <option key={pathObj.full_path} value={pathObj.full_path}>
                  {pathObj.relative_path}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center mb-2">
              <input
                type="radio"
                checked={isCustomPath}
                onChange={() => setIsCustomPath(true)}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">Enter custom location</span>
            </label>
            <input
              type="text"
              value={customPath}
              onChange={e => setCustomPath(e.target.value)}
              disabled={!isCustomPath}
              placeholder="Enter custom file path..."
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 disabled:bg-gray-100"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={!selectedPath && !customPath}
            className="px-4 py-2 bg-[#713B57] text-white rounded-lg hover:bg-[#5A2F46] disabled:opacity-50"
          >
            Move Object
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveObjectModal;
