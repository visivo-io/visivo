import React, { useState } from 'react';
import { Handle } from 'react-flow-renderer';
import ObjectPill from '../editors/ObjectPill';
import useStore from '../../stores/store';
import EditIcon from '@mui/icons-material/Edit';

const ObjectPillNode = ({ data, onNodeClick }) => {
  const [hovered, setHovered] = useState(false);

  // Get type info and source editing functions from stores
  const namedChild = useStore(state => state.namedChildren[data.name]);
  const openEditModal = useStore(state => state.openEditModal);
  const getSourceStatus = useStore(state => state.getSourceStatus);

  const isSource = namedChild?.type_key === 'sources';
  const sourceStatus = isSource ? getSourceStatus(data.name) : null;

  const handleEditClick = e => {
    e.stopPropagation(); // Prevent triggering onNodeClick
    if (isSource && namedChild) {
      // Build source config for editing
      const sourceConfig = {
        name: data.name,
        type: namedChild.config?.type,
        ...namedChild.config,
      };
      openEditModal(sourceConfig);
    }
  };

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
      onClick={() => onNodeClick && onNodeClick(data)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position="left" style={{ top: '50%' }} />

      {/* Status indicator for modified/new sources */}
      {sourceStatus && sourceStatus !== 'published' && (
        <span
          className={`
            absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full z-10
            ${sourceStatus === 'new' ? 'bg-green-500' : 'bg-amber-500'}
          `}
          title={sourceStatus === 'new' ? 'New (unsaved)' : 'Modified'}
        />
      )}

      <ObjectPill name={data.name} />

      {/* Edit button on hover for sources */}
      {isSource && hovered && (
        <button
          onClick={handleEditClick}
          className="
            absolute -right-8 top-1/2 -translate-y-1/2
            p-1 rounded-full bg-white shadow-md
            hover:bg-gray-100 transition-colors
            border border-gray-200
          "
          title="Edit source"
        >
          <EditIcon fontSize="small" className="text-gray-600" />
        </button>
      )}

      <Handle type="source" position="right" style={{ top: '50%' }} />
    </div>
  );
};

export default ObjectPillNode;
