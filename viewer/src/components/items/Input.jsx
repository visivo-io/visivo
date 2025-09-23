import React, { useState, useEffect } from 'react';
import Dropdown from './inputs/Dropdown';
import Loading from '../common/Loading';

const DROPDOWN = 'dropdown';

const Input = ({ input, project, itemWidth }) => {
  const [loading, setLoading] = useState(true);
  const [componentData, setComponentData] = useState(null);

  useEffect(() => {
    const prepareComponent = () => {
      switch (input.type) {
        case DROPDOWN:
          let options = [];
          let defaultValue;
          if (Array.isArray(input.options)) {
            options = input.options.map(option => ({ id: option, label: option }));
            defaultValue = {
              id: input.default,
              label: input.default,
            };
          }
          setComponentData({ type: DROPDOWN, options, defaultValue, label: input.label ?? '' });
          break;
        default:
          setComponentData(null);
      }
      setLoading(false);
    };

    prepareComponent();
  }, [input.type, input.options, input.default]);

  if (loading) return <Loading text={input.name} width={itemWidth} />;

  const renderComponent = () => {
    if (!componentData) return null;

    switch (componentData.type) {
      case DROPDOWN:
        return (
          <Dropdown defaultValue={componentData.defaultValue} options={componentData.options} />
        );
      default:
        return null;
    }
  };

  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">{renderComponent()}</div>
    </div>
  );
};

export default Input;
