import Chart from './Chart';
import Table from './Table';
import Selector from './Selector';
import Markdown from './Markdown';

/**
 * Utility function to get height value from height string
 */
export const getItemHeight = height => {
  if (height === 'xsmall') {
    return 128;
  } else if (height === 'small') {
    return 256;
  } else if (height === 'medium') {
    return 396;
  } else if (height === 'large') {
    return 512;
  } else if (height === 'xlarge') {
    return 768;
  } else {
    return 1024;
  }
};

/**
 * Utility function to calculate item width
 */
export const getItemWidth = (containerWidth, widthBreakpoint, items, item) => {
  if (containerWidth < widthBreakpoint) {
    return containerWidth;
  }
  const totalWidth = items.reduce((partialSum, i) => {
    const itemWidth = i.width ? i.width : 1;
    return partialSum + itemWidth;
  }, 0);

  // Handle edge case where totalWidth is 0
  if (totalWidth === 0) {
    return containerWidth;
  }

  const itemWidth = item.width ? item.width : 1;
  return containerWidth * (itemWidth / totalWidth);
};

/**
 * Item component that renders dashboard items (charts, tables, selectors, markdown)
 */
const Item = ({
  item,
  project,
  height = 396,
  width = 600,
  itemWidth = 1,
  rowIndex = 0,
  itemIndex = 0,
  keyPrefix = 'item',
  row = null,
}) => {
  if (item.chart) {
    return (
      <Chart
        chart={item.chart}
        project={project}
        height={height - 8}
        width={width}
        itemWidth={itemWidth}
        key={`${keyPrefix}Row${rowIndex}Item${itemIndex}`}
      />
    );
  } else if (item.table) {
    return (
      <Table
        table={item.table}
        project={project}
        itemWidth={itemWidth}
        width={width}
        height={height}
        key={`${keyPrefix}Row${rowIndex}Item${itemIndex}`}
      />
    );
  } else if (item.selector) {
    return (
      <Selector
        selector={item.selector}
        project={project}
        itemWidth={itemWidth}
        key={`${keyPrefix}Row${rowIndex}Item${itemIndex}`}
      />
    );
  } else if (item.markdown) {
    return (
      <Markdown
        markdown={item}
        row={row}
        height={height}
        key={`${keyPrefix}Row${rowIndex}Item${itemIndex}`}
      />
    );
  }

  return null;
};

export default Item;
