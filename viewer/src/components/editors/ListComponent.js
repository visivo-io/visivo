import renderValue from './renderValue';

function ListComponent({ name, data, path }) {
    // Return null if data is null or undefined
    if (data === null || data === undefined || data.length === 0) {
      return null;
    }
    
    return (
      <div className="flex flex-col gap-1">
        {name && isNaN(parseInt(name)) && typeof name === 'string' && (
            <div className="text-md font-medium text-purple-600">{name}</div>
        )}
        <div className="p-3 rounded-md">
            <div className="flex flex-wrap gap-2">
            {data.map((item, index) => {
                const childPath = [...path, index];
                return (
                    <div key={index} className="border-gray-200 border bg-purple-50 p-3 rounded-md text-" 
                    style={{ minWidth: '30px', maxWidth: '400px', flex: '1 0 auto' }}
                    >
                    {renderValue(index, item, childPath)}
                    </div>
                );
            })}
            </div>
        </div>
      </div>
    );
  }
  
  export default ListComponent;