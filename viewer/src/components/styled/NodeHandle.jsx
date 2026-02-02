import { Handle } from 'reactflow';

export const NodeHandle = ({ type, colors }) => (
  <Handle
    type={type}
    position={type === 'target' ? 'left' : 'right'}
    style={{
      background: colors.connectionHandle,
      width: 8,
      height: 8,
      border: '2px solid white',
    }}
  />
);
