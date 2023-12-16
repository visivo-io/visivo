export const fetchTraces = async (projectId, traceNames) => {
    const traceNameParams = traceNames.map(t => `trace_names=${t}`).join("&")
    const response = await fetch(`/api/traces/?project_id=${projectId}&${traceNameParams}`);
    if (response.status === 200) {
        return await response.json();
    } else {
        console.log("Error fetching traces")
        return []
    }
}