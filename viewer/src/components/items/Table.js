import Loading from "../Loading";
import React, { useEffect, useState } from "react";
import { tableDataFromCohortData, tableColumnsWithDot, tableColumnsWithUnderscores } from '../../models/Table';
import { createTheme, ThemeProvider, Box, Button } from '@mui/material';
import { useTracesData } from "../../hooks/useTracesData";
import { ItemContainer } from "./ItemContainer";
import CohortSelect from "../select/CohortSelect";
/* eslint-disable react/jsx-pascal-case */
import {
    MRT_ShowHideColumnsButton,
    MRT_TablePagination,
    MRT_ToggleDensePaddingButton,
    MRT_ToggleFiltersButton,
    MRT_ToolbarAlertBanner,
    MRT_GlobalFilterTextField,
    useMaterialReactTable,
    MRT_TableContainer,
} from 'material-react-table';
/* eslint-enable react/jsx-pascal-case */
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { mkConfig, generateCsv } from "export-to-csv";

const Table = ({ table, project, itemWidth, height, width }) => {
    const traceNames = table.traces.map((trace) => trace.name);
    const tracesData = useTracesData(project.id, traceNames);
    const [selectedTableCohort, setSelectedTableCohort] = useState(null);
    const [columns, setColumns] = useState([]);
    const [tableData, setTableData] = useState([]);

    const csvConfig = mkConfig({
        fieldSeparator: ',',
        decimalSeparator: '.',
        useKeysAsHeaders: true,
    });

    useEffect(() => {
        if (selectedTableCohort && tracesData) {
            setColumns(tableColumnsWithDot(table, selectedTableCohort.data, selectedTableCohort.traceName));
        }
    }, [selectedTableCohort, tracesData, table]);

    useEffect(() => {
        if (selectedTableCohort && columns) {
            setTableData(tableDataFromCohortData(selectedTableCohort.data, columns));
        }
    }, [selectedTableCohort, columns]);
    const handleExportData = () => {
        const csv = generateCsv(csvConfig)(tableData); 
        const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(csvBlob);
        const link = document.createElement('a');
        link.href = url;
        
        const cohortName = selectedTableCohort?.cohortName || 'cohort';
        const traceName = selectedTableCohort?.traceName || 'trace';
        
        link.setAttribute('download', `${table.name}_${traceName}_${cohortName}.csv`);
        
        document.body.appendChild(link);
        link.click(); 
        document.body.removeChild(link);
    };
    
    

    const useTable = useMaterialReactTable({
        columns: tableColumnsWithUnderscores(columns),
        data: tableData,
        enableRowSelection: true,
        enableGlobalFilter: true,
        enableTopToolbar: true,
        enableFullScreenToggle: true,
        enableGrouping: true,

        muiPaginationProps: {
            rowsPerPageOptions: [3, 5, 15, 25, 50, 100, 500, 1000]
          },
        
        initialState: { 
            showGlobalFilter: true, 
            density: "compact", 
            pagination: {
                pageSize: table.rows_per_page
            }
        },
    });

    if (!tracesData) {
        return <Loading text={table.name} width={itemWidth} />;
    }

    const tableTheme = createTheme({
        palette: {
            primary: { main: 'rgb(210, 89, 70)' },
            info: { main: 'rgb(79, 73, 76)' },
        },
    });

    const onSelectedCohortChange = (changedSelectedTracesData) => {
        const traceName = Object.keys(changedSelectedTracesData)[0];
        if (traceName) {
            const cohortName = Object.keys(changedSelectedTracesData[traceName])[0];
            setSelectedTableCohort({ traceName, data: changedSelectedTracesData[traceName][cohortName], cohortName });
        }
    };
    /* eslint-disable react/jsx-pascal-case */
    return (
        <ThemeProvider theme={tableTheme}>
            <ItemContainer>
                <Box>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between', // Separates the left and right containers
                        backgroundColor: 'inherit',
                        borderRadius: '4px',
                        gap: '6px',
                        alignItems: 'center',
                        padding: '11px 11px',
                        flexWrap: 'wrap', // Allows wrapping if screen size is small
                        '@media max-width: 768px': {
                                flexDirection: 'column',
                            },
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <MRT_GlobalFilterTextField table={useTable} />
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <MRT_ToggleFiltersButton table={useTable} />
                        <MRT_ShowHideColumnsButton table={useTable} />
                        <MRT_ToggleDensePaddingButton table={useTable} />
                        <Button onClick={handleExportData} startIcon={<FileDownloadIcon />}></Button>
                        <CohortSelect
                            tracesData={tracesData}
                            onChange={onSelectedCohortChange}
                            selector={table.selector}
                            parentName={table.name}
                            parentType="table"
                        />
                    </Box>
                </Box>

                    <MRT_TableContainer table={useTable} sx={{ width: width, maxHeight: `${height - 120}px` }} />
                    
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <MRT_TablePagination table={useTable} />
                        </Box>
                        <Box sx={{ display: 'grid', width: '100%' }}>
                            <MRT_ToolbarAlertBanner stackAlertBanner table={useTable} />
                        </Box>
                    </Box>
                </Box>
            </ItemContainer>
        </ThemeProvider>
    );
    /* eslint-enable react/jsx-pascal-case */
}

export default Table;