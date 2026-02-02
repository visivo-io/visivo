export const NodeWrapper = ({ isHighlighted, colors, children }) => (
  <div
    className={`
      relative flex items-center gap-2 px-3 py-2
      rounded-lg border-2 shadow-sm cursor-pointer
      transition-all duration-150
      ${isHighlighted ? `${colors.bg} ${colors.borderSelected} shadow-md` : `bg-white ${colors.border} hover:${colors.bg}`}
    `}
  >
    {children}
  </div>
);
