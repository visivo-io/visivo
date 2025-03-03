import renderValue from './renderValue';

function ListComponent({ name, data, path }) {
    // Return null if data is null or undefined
    if (data === null || data === undefined || data.length === 0) {
      return null;
    }
    
    return (
      <div className="flex flex-col gap-2">
        {name && isNaN(parseInt(name)) && (
            <div className="text-lg font-medium text-gray-800">{name}</div>
        )}
        <div className="border p-4 rounded">
            <div className="flex flex-col gap-2">
            {data.map((item, index) => {
                const childPath = [...path, index];
                return renderValue(index, item, childPath);
            })}
            </div>
        </div>
      </div>
    );
  }
  
  export default ListComponent;