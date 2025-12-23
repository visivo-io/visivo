import React from 'react';
import { Handle } from 'react-flow-renderer';
import ObjectPill from '../editors/ObjectPill'; // Adjust path to your ObjectPill component

const ObjectPillNode = ({ data, onNodeClick }) => {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center' }}
      onClick={() => onNodeClick && onNodeClick(data)}
    >
      <Handle type="target" position="left" style={{ top: '50%' }} />
      <ObjectPill name={data.name} />
      <Handle type="source" position="right" style={{ top: '50%' }} />
    </div>
  );
};

export default ObjectPillNode;
