import React from 'react';
import NameSelect from './NameSelect';
import tw from 'tailwind-styled-components';

export const ChartContainer = tw.div`
    relative
`;

const NameSelector = ({ selector, itemWidth, names }) => {
  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">
        <NameSelect
          names={names}
          onChange={() => {}}
          selector={selector}
          parentName={selector.name}
          parentType="chart"
          alwaysPushSelectionToUrl={true}
        />
      </div>
    </div>
  );
};

export default NameSelector;
