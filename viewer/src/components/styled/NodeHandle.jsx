import { Handle } from 'reactflow';

/**
 * NodeHandle — the styled reactflow connection handle used by lineage + ERD
 * nodes.
 *
 * The optional `id` lets a node expose multiple, individually-addressable
 * handles (VIS-1006: one handle per column row so an onConnect carries the
 * source/target column name). It's omitted by every existing single-handle
 * call site, so reactflow keeps treating those as the node's default handle.
 */
export const NodeHandle = ({ type, colors, id, position, style }) => (
  <Handle
    type={type}
    id={id}
    position={position || (type === 'target' ? 'left' : 'right')}
    style={{
      background: colors.connectionHandle,
      width: 8,
      height: 8,
      border: '2px solid white',
      ...style,
    }}
  />
);
