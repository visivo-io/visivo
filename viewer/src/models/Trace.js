import { merge } from 'lodash';

const COLUMN_REGEX = /column\((.+)\)(\[(\d+)\]|)/

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

export const replaceColumnRefWithData = (obj, data) => {
    for (const key in obj) {
        const value = obj[key];
        if (typeof value === 'string' && value.match(COLUMN_REGEX)) {
            const match = value.match(COLUMN_REGEX)
            if (match[3] !== undefined) {
                obj[key] = data.columns[match[1]][match[3]];
            } else {
                obj[key] = data.columns[match[1]];
            }
        } else if (Array.isArray(value)) {
            value.forEach(member => replaceColumnRefWithData(member, data));
        } else if (typeof obj[key] === "object") {
            replaceColumnRefWithData(value, data);
        }
    }
};

export const mergeStaticPropertiesAndData = (traceProps, traceData, cohortOn) => {
    replaceColumnRefWithData(traceProps, traceData)
    const mergedTraceAndNestedData = merge({}, traceProps, traceData.props, { name: cohortOn })
    return mergedTraceAndNestedData;
};

export const cleanedPlotData = (traceData, traceObj) => {
    return Object.keys(traceData[traceObj.name]).map((cohortOn) => {
        const traceDatum = convertDotKeysToNestedObject(traceData[traceObj.name][cohortOn])

        return mergeStaticPropertiesAndData(traceObj.props, traceDatum, cohortOn)
    })
};

export const cleanedTableData = (traceData, tableObj) => {
    let tableData = traceData[tableObj.trace.name][Object.keys(traceData[tableObj.trace.name])[0]]
    tableData = convertDotKeysToNestedObject(tableData)["columns"];
    const columnData = [];
    tableObj.columns.forEach((column) => {
        const columnName = column['column'];
        const columnRows = tableData[columnName];
        columnRows.forEach((rowData, index) => {
            if (columnData.length < index + 1) {
                columnData.push({});
            }
            const row = columnData[index];
            row[columnName] = rowData;
        });
    });

    return columnData;
};