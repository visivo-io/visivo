import { merge } from 'lodash';

const COLUMN_REGEX = /column\((.+)\)(\[(-?\d*):?(-?\d*)\]|)/;


export const insightNamesInData = insightssData => {
  return Object.keys(insightssData);
};

// Reuse: convert dot.notation keys → nested objects
const convertDotKeysToNestedObject = flatObject => {
  const nestedObject = {};
  for (let key in flatObject) {
    if (key.includes('.')) {
      const keyParts = key.split('.');
      let currentObject = nestedObject;
      for (let i = 0; i < keyParts.length; i++) {
        const currentKey = keyParts[i];
        if (i === keyParts.length - 1) {
          currentObject[currentKey] = flatObject[key];
        } else {
          if (!currentObject[currentKey]) {
            currentObject[currentKey] = {};
          }
          currentObject = currentObject[currentKey];
        }
      }
    } else {
      nestedObject[key] = flatObject[key];
    }
  }
  return nestedObject;
};

// Reuse: replace "column(...)" references with real data
const replaceColumnRefWithData = (obj, data, parent = null, key = null) => {
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => replaceColumnRefWithData(item, data, obj, index));
  } else if (typeof obj === 'object' && obj !== null) {
    for (const prop in obj) {
      replaceColumnRefWithData(obj[prop], data, obj, prop);
    }
  } else if (typeof obj === 'string' && obj.match(COLUMN_REGEX)) {
    const match = obj.match(COLUMN_REGEX);
    const columnName = match[1];
    const unparsedStart = match[3];
    const unparsedEnd = match[4];

    if (unparsedStart !== undefined && unparsedEnd !== undefined) {
      const start = unparsedStart ? parseInt(unparsedStart, 10) : 0;
      const end = unparsedEnd ? parseInt(unparsedEnd, 10) : null;
      if (end !== null) {
        parent[key] = data.columns[columnName].slice(start, end);
      } else if (match[2].includes(':') && end === null) {
        parent[key] = data.columns[columnName].slice(start);
      } else {
        parent[key] = data.columns[columnName].slice(start)[0];
      }
    } else {
      parent[key] = data.columns[columnName];
    }
  }
};

// Merge config props + data-driven props
const mergeStaticPropertiesAndData = (insightProps, insightData) => {
  replaceColumnRefWithData(insightProps, insightData);
  return merge({}, insightProps, insightData.props);
};

export const chartDataFromInsightData = (insightConfigs, insightData) => {
  return insightConfigs.map(config => {
    const dataBlock = insightData[config.name]?.insight ?? [];

    // Transform rows into column-oriented structure like your other pipeline
    const columns = {};
    dataBlock.forEach(row => {
      for (let key in row) {
        if (!columns[key]) columns[key] = [];
        columns[key].push(row[key]);
      }
    });

    const duplicatedProps = structuredClone(config.props);
    const traceDatum = convertDotKeysToNestedObject({ columns });

    const insight = mergeStaticPropertiesAndData(duplicatedProps, traceDatum);

    return {
      name: config.name,
      figure: {
        data: [insight],
        layout: { title: config.name }
      }
    };
  });
};
