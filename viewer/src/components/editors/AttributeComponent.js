import useStore from '../../stores/store'; // Adjust path to Zustand store

function AttributeComponent({ name, value, path,}) {
  const updateNamedChildAttribute = useStore((state) => state.updateNamedChildAttribute);
  
  const handleChange = (newValue) => {
    updateNamedChildAttribute(path, newValue);
  };
  // Determine flex direction based on name type
  const flexDirection = typeof name === 'string' ? 'flex-col' : 'flex-row';

  return (
    <div className={`flex ${flexDirection}`}>
       <span className="text-sm p-1 font-medium text-grey-400">{name}</span>
      
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full border border-gray-300 rounded-md shadow-md focus:ring-blue-500 focus:border-blue-500 p-2"
      />
    </div>
  );
}

export default AttributeComponent;