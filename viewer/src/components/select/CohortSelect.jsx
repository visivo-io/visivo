import { cohortNamesInData } from '../../models/Trace';
import NameSelect from './NameSelect';

// Legacy function - kept for backward compatibility
export const generateNewTraceDataFromSelection = (tracesData, selectedCohortNames) => {
  const newTraceData = {};
  if (!selectedCohortNames) {
    return newTraceData;
  }
  Object.keys(tracesData).forEach(traceName => {
    Object.keys(tracesData[traceName]).forEach(cohortName => {
      if (selectedCohortNames === cohortName || selectedCohortNames.includes(cohortName)) {
        if (!newTraceData[traceName]) {
          newTraceData[traceName] = {};
        }
        newTraceData[traceName][cohortName] = tracesData[traceName][cohortName];
      }
    });
  });
  return newTraceData;
};

const CohortSelect = ({
  onChange,
  // Legacy prop - for backward compatibility
  tracesData,
  // New props for updated data flow
  cohortNames,
  selectedCohorts,
  showLabel,
  selector,
  parentName,
  parentType,
  alwaysPushSelectionToUrl = false,
  onVisible = () => {},
}) => {
  const onNameSelectChange = selectedNames => {
    if (cohortNames && selectedCohorts !== undefined) {
      // New data flow: pass selected cohort names directly
      onChange(selectedNames);
    } else if (tracesData) {
      // Legacy data flow: generate trace data from selection
      onChange(generateNewTraceDataFromSelection(tracesData, selectedNames));
    }
  };

  // Determine which names to use based on available props
  const availableNames = cohortNames || (tracesData ? cohortNamesInData(tracesData) : []);
  const currentSelection = selectedCohorts || [];

  return (
    <>
      <NameSelect
        names={availableNames}
        selectedNames={currentSelection}
        selector={selector}
        parentName={parentName}
        parentType={parentType}
        onChange={onNameSelectChange}
        alwaysPushSelectionToUrl={alwaysPushSelectionToUrl}
        onVisible={onVisible}
        showLabel={showLabel}
      />
    </>
  );
};

export default CohortSelect;
