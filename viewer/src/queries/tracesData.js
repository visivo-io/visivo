export const fetchTraceData = async (trace) => {
    const traceResponse = await fetch(trace.signed_data_file_url);
    return [trace.name, await traceResponse.json()];
}
