import { merge } from 'lodash';

const COLUMN_REGEX = /column\((.+)\)(\[(-?\d*):?(-?\d*)\]|)/

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

export const cleanedPlotData = (traceData, traceObj) => {
    return Object.keys(traceData[traceObj.name]).map((cohortOn) => {
        const traceDatum = convertDotKeysToNestedObject(traceData[traceObj.name][cohortOn])

        return mergeStaticPropertiesAndData(traceObj.props, traceDatum, cohortOn)
    })
};

export const cleanedTableData = (traceData, dataName, columns) => {
    let tableData
    //TODO find 
    traceData.forEach((traceDatum) => {
        // traceData[dataName][Object.keys(traceData[tableObj.trace.name])[0]]
    });
    tableData = convertDotKeysToNestedObject(tableData)["columns"];
    const columnData = [];
    columns.forEach((column) => {
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

export const column = (table, traceData) => {
    let columns
    if (!table.columns) {
        columns = table.columns.map((column) => {
            return { accessorKey: column.column, ...column }
        })
    } else if (traceData && traceData.length > 0) {
        columns = Object.keys(traceData[0]).map((key) => {
            return { accessorKey: key, header: key }
        })
    }
    return columns;
}