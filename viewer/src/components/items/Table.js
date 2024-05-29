import Loading from "../Loading";
import Menu from "./Menu"
import MenuItem from "../styled/MenuItem";
import React, { useEffect, useState } from "react";
import { MaterialReactTable } from 'material-react-table';
import { tableDataFromCohortData, tableColumns, tableColumnsWithDot, tableColumnsWithUnderscores } from '../../models/Table'
import { createTheme, ThemeProvider } from '@mui/material';
import { useTracesData } from "../../hooks/useTracesData";
import tw from "tailwind-styled-components"
import CohortSelect from "./CohortSelect";

export const TableContainer = tw.div`
    relative
`;

const Table = ({ table, project, itemWidth, height, width }) => {
    const traceNames = table.traces.map((trace) => trace.name)
    const tracesData = useTracesData(project.id, traceNames)
    const [hovering, setHovering] = useState(false)
    const [selectedTableCohort, setSelectedTableCohort] = useState(null)
    const [columns, setColumns] = useState([])
    const [tableData, setTableData] = useState([])

    useEffect(() => {
        if (selectedTableCohort && tracesData) {
            setColumns(tableColumnsWithDot(table, selectedTableCohort))
        }
    }, [selectedTableCohort, tracesData, table]);

    useEffect(() => {
        if (selectedTableCohort && columns) {
            setTableData(tableDataFromCohortData(selectedTableCohort, columns))
        }
    }, [selectedTableCohort, columns]);

    if (!tracesData) {
        return <Loading text={table.name} width={itemWidth} />
    }

    const tableTheme = createTheme({
        palette: {
            primary: { main: 'rgb(210, 89, 70)' },
            info: { main: 'rgb(79, 73, 76)' }
        }
    });

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        const traceName = Object.keys(changedSelectedTracesData)[0]
        const cohortName = Object.keys(changedSelectedTracesData[traceName])[0]
        setSelectedTableCohort(changedSelectedTracesData[traceName][cohortName])
    }

    return (
        <TableContainer onMouseOver={() => setHovering(true)} onMouseOut={() => setHovering(false)}>
            <Menu hovering={hovering}>
                <MenuItem>
                    <CohortSelect tracesData={tracesData} onChange={onSelectedCohortChange} isMulti={false} />
                </MenuItem>
            </Menu>
            <ThemeProvider theme={tableTheme}>
                <MaterialReactTable
                    columns={tableColumnsWithUnderscores(columns)}
                    data={tableData}
                    initialState={{
                        density: 'compact'
                    }}
                    enableStickyHeader
                    muiTableContainerProps={{
                        sx: {
                            maxHeight: `${height - 120}px`,
                        },
                    }}
                    muiTablePaperProps={{
                        sx: {
                            width: `${width - 8}px` //Minus margin
                        },
                    }}
                    {...table.props}
                    enableRowSelection
                    enableColumnOrdering
                    enableGlobalFilter={false}
                />
            </ThemeProvider>
        </TableContainer>
    );
}

export default Table;