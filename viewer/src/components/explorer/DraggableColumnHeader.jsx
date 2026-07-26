import React from 'react';
import DataTableHeader from '../common/DataTableHeader';
import DraggableTh from '../views/common/DraggableTh';
import { getTypeColors } from '../views/common/objectTypeConfigs';

// B9 (04-bug-inventory.md) / VIS-1071 restyle sweep: metric/dimension
// border-top + tint now derive from the canonical `objectTypeConfigs`
// palette instead of hand-rolled cyan/teal classes (the fork the CLAUDE.md
// "always use objectTypeConfigs" rule exists to prevent — a future palette
// change would otherwise silently desync this file). Tailwind can't compose
// a dynamic `border-t-{color}-500` class from a runtime value, so the
// border-top COLOR is an inline style sourced from `connectionHandle` (the
// same hex `objectTypeConfigs` already exposes for ERD connection handles);
// the background tint uses the config's own `bg` token directly. The error
// state uses the shared `highlight-*` tokens, not raw `red-*` (B9's other
// half).
const ERROR_CLASS_NAME = 'border-t-2 border-t-highlight-500 bg-highlight-50/50';

const computedHeaderStyle = column => {
  if (column.computedError) return { className: ERROR_CLASS_NAME };
  if (!column.computedType) return { className: '' };
  const colors = getTypeColors(column.computedType);
  return {
    className: `border-t-2 ${colors.bg}`,
    style: { borderTopColor: colors.connectionHandle },
  };
};

const DraggableColumnHeader = ({ column, sorting, onSortChange, onInfoClick }) => {
  const { className: computedClassName, style: computedStyle } = computedHeaderStyle(column);

  return (
    <DraggableTh
      as="div"
      name={column.name}
      sourceType="data-table"
      className={computedClassName}
      style={computedStyle}
      dataTestId={`draggable-col-${column.name}`}
      title={column.computedError || undefined}
    >
      <DataTableHeader
        column={column}
        sorting={sorting}
        onSortChange={onSortChange}
        onInfoClick={onInfoClick}
      />
    </DraggableTh>
  );
};

export default React.memo(DraggableColumnHeader);
