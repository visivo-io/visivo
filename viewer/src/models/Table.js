// Table data is an array of objects where the key matches the accessorKey of the column.
export const tableDataFromCohortData = (tableCohort, columns) => {
    const columnData = [];
    columns.forEach((column) => {
        const columnName = column['accessorKey'];
        const columnRows = tableCohort[columnName];
        columnRows.forEach((rowData, index) => {
            if (columnData.length < index + 1) {
                columnData.push({});
            }
            const row = columnData[index];
            row[columnName.replace(".", "_")] = rowData;
        });
    });
    return columnData;
};


export const tableColumnsWithDot = (table, tableCohort) => {
    const getHeaderFromKey = (key) => {
        return key.split('.').slice(-1)[0].replace('_', ' ')
    }

    let columns = []
    if (table.columns) {
        columns = table.columns.map((column) => {
            const header = 'header' in column ? column.header : getHeaderFromKey(column.key)
            return { accessorKey: column.key, header }
        })
    } else if (tableCohort) {
        columns = Object.keys(tableCohort).map((key) => {
            return { accessorKey: key, header: getHeaderFromKey(key) }
        })
    }
    return columns;
}

//React table will try to evaluate dot notation
export const tableColumnsWithUnderscores = (columns) => {
    return columns.map((column) => {
        return { ...column, accessorKey: column["accessorKey"].replace(".", "_") }
    })
}