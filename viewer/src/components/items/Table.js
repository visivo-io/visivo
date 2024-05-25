import Loading from "../Loading";
import React, { useState } from "react";
import { MaterialReactTable } from 'material-react-table';
import { cleanedTableData, cleanedPlotData } from '../../models/Trace'
import { createTheme, ThemeProvider } from '@mui/material';
import { useTracesData } from "../../hooks/useTracesData";

const Table = (props) => {
    const traceNames = props.table.traces.map((trace) => trace.name)
    const tracesData = useTracesData(props.project.id, traceNames)

    const [selectedPlotData, setSelectedPlotData] = useState([])

    const plotData = () => {
        return props.table.traces.map((trace) => {
            return cleanedPlotData(tracesData, trace)
        }).flat();
    }

    if (!tracesData) {
        return <Loading text={props.table.name} width={props.itemWidth} />
    }

    const initialPlotData = plotData()

    console.log(JSON.stringify(initialPlotData))
    console.log(JSON.stringify(tracesData))

    const tableTheme = createTheme({
        palette: {
            primary: { main: 'rgb(210, 89, 70)' },
            info: { main: 'rgb(79, 73, 76)' }
        }
    });
    const tableData = cleanedTableData(tracesData, props.table)
    let columns = []
    if (!props.table.columns) {
        columns = props.table.columns.map((column) => {
            return { accessorKey: column.column, ...column }
        })
    } else if (tracesData && tableData.length > 0) {
        columns = Object.keys(tableData[0]).map((key) => {
            return { accessorKey: key, header: key }
        })
    }

    return (
        <ThemeProvider theme={tableTheme}>
            <MaterialReactTable
                columns={columns}
                data={tableData}
                initialState={{
                    density: 'compact'
                }}
                enableStickyHeader
                muiTableContainerProps={{
                    sx: {
                        maxHeight: `${props.height - 120}px`,
                    },
                }}
                muiTablePaperProps={{
                    sx: {
                        width: `${props.width - 8}px` //Minus margin
                    },
                }}
                {...props.table.props}
                enableRowSelection
                enableColumnOrdering
                enableGlobalFilter={false}
            />
        </ThemeProvider>
    );
}

export default Table;