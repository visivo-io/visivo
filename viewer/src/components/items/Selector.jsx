import React from 'react';
import tw from 'tailwind-styled-components';
import CohortSelector from '../select/CohortSelector';
import NameSelector from '../select/NameSelector';

export const ChartContainer = tw.div`
    relative
`;

const Selector = ({ selector, project, itemWidth }) => {
  const isTraces = selector.options.every(
    option => option.hasOwnProperty('type') && option.type === 'trace'
  );
  const names = selector.options.map(option => option.name);

  if (isTraces) {
    return (
      <div className={`grow-${itemWidth} p-2 m-auto flex`}>
        <div className="m-auto justify-center">
          <CohortSelector
            names={names}
            project={project}
            onChange={() => {}}
            selector={selector}
            parentName={selector.name}
            parentType="chart"
            alwaysPushSelectionToUrl={true}
          />
        </div>
      </div>
    );
  }
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
