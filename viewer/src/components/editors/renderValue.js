import ListComponent from './ListComponent';
import ObjectComponent from './ObjectComponent';
import AttributeComponent from './AttributeComponent';

function renderValue(key, value, path, useNamedChildren = true) {
  // Handle null or undefined values
  if (value === null || value === undefined) {
    return (
      <div className="text-sm text-gray-500 italic">
        {key ? `${key}: ` : ''}null
      </div>
    );
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return <ListComponent key={key} name={key} data={value} path={path} useNamedChildren={useNamedChildren} />;
    } else {
      return <ObjectComponent key={key} name={key} data={value} path={path} useNamedChildren={useNamedChildren} />;
    }
  } else {
    return <AttributeComponent key={key} name={key} value={value} path={path} useNamedChildren={useNamedChildren} />;
  }
}

export default renderValue;