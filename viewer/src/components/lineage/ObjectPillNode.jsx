import React from 'react';
import { Handle } from 'react-flow-renderer';
import ObjectPill from '../editors/ObjectPill'; // Adjust path to your ObjectPill component

const ObjectPillNode = ({ data }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Handle type="target" position="left" style={{ top: '50%' }} />
      <ObjectPill name={data.name} />
      <Handle type="source" position="right" style={{ top: '50%' }} />
    </div>
  );
};

export default ObjectPillNode;