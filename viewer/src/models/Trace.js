import { merge } from 'lodash';

const COLUMN_REGEX = /column\((.+)\)(\[(-?\d*):?(-?\d*)\]|)/

export const traceNamesInData = (tracesData) => {
    return Object.keys(tracesData);
}

export const cohortNamesInData = (tracesData) => {
    return Object.keys(tracesData).map((traceName) => {
        return Object.keys(tracesData[traceName]).map((cohortName) => {
            return cohortName
        })
    }).flat()
}

const convertDotKeysToNestedObject = (flatObject) => {
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
export const replaceColumnRefWithData = (obj, data, parent = null, key = null) => {
    if (Array.isArray(obj)) {
        obj.forEach((item, index) => replaceColumnRefWithData(item, data, obj, index));
    } else if (typeof obj === "object" && obj !== null) {
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
            } else if (match[2].includes(":") && end === null) {
                parent[key] = data.columns[columnName].slice(start);
            } else {
                parent[key] = data.columns[columnName].slice(start)[0];
            }
        } else {
            parent[key] = data.columns[columnName];
        }

    }
};
export const mergeStaticPropertiesAndData = (traceProps, traceData, cohortOn) => {
    replaceColumnRefWithData(traceProps, traceData)
    const mergedTraceAndNestedData = merge({}, traceProps, traceData.props, { name: cohortOn })
    return mergedTraceAndNestedData;
};

export const chartDataFromCohortData = (cohortData, trace, cohortName) => {
    const traceDatum = convertDotKeysToNestedObject(cohortData)

    return mergeStaticPropertiesAndData(trace.props, traceDatum, cohortName)
}

