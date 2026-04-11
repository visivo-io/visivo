import React from 'react';
import tw from 'tailwind-styled-components';
import NameSelector from '../select/NameSelector';

export const ChartContainer = tw.div`
    relative
`;

const Selector = ({ selector, project, itemWidth }) => {
  const names = selector.options.map(option => option.name);

  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">
        <NameSelector
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

export default Selector;
