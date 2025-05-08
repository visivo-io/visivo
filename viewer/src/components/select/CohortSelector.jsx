import Loading from '../common/Loading';
import React from 'react';
import CohortSelect from './CohortSelect';
import tw from 'tailwind-styled-components';
import { useTracesData } from '../../hooks/useTracesData';

export const ChartContainer = tw.div`
    relative
`;

const CohortSelector = ({ selector, project, itemWidth, names }) => {
  const tracesData = useTracesData(project.id, names);

  if (!tracesData) {
    return <Loading text={selector.name} width={itemWidth} />;
  }

  return (
    <div className={`grow-${itemWidth} p-2 m-auto flex`}>
      <div className="m-auto justify-center">
        <CohortSelect
          tracesData={tracesData}
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

export default CohortSelector;
