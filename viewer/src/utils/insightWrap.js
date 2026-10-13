import { generateUniqueName } from './uniqueName';

// Shared by every surface that wraps an insight in a chart (Library "Wrap in
// Chart…", canvas drop, ReferencePicker) so their naming never drifts. The `-`
// separator keeps collision suffixes in the `<insight>-chart` style.
export const mintWrapperChartName = (insightName, existingChartNames) =>
  generateUniqueName(`${insightName}-chart`, existingChartNames, { separator: '-' });

export const buildWrapperChartConfig = insightName => ({
  insights: [`ref(${insightName})`],
});
