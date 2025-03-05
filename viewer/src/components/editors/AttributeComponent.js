import useStore from '../../stores/store'; // Adjust path to Zustand store

function AttributeComponent({ name, value, path,}) {
  const updateNamedChildAttribute = useStore((state) => state.updateNamedChildAttribute);
  
  const handleChange = (newValue) => {
    // Determine which update function to use based on context
    console.log('updateNamedChildAttribute', path, newValue);
    updateNamedChildAttribute(path, newValue);

  };

  return (
    <div className="flex items-center gap-2">
      {name && isNaN(parseInt(name)) && name !== '0' && (
       <span className="text-sm font-medium">{name}:</span>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 p-2"
      />
    </div>
  );
}

export default AttributeComponent;