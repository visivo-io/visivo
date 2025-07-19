const VerticalDivider = ({ isDragging, handleMouseDown }) => {
  return (
    <div
      className={`w-1 bg-gray-200 hover:bg-gray-300 cursor-ew-resize flex items-center justify-center group ${
        isDragging ? 'bg-gray-400' : ''
      }`}
      onMouseDown={handleMouseDown}
    >
      <div className="w-1 h-8 bg-gray-400 group-hover:bg-gray-500 rounded-full"></div>
    </div>
  );
};

export default VerticalDivider;
