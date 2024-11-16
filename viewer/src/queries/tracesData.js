export const fetchTracesData = async (traces) => {
    if (traces.length === 0) {
        return {}
    }
    const returnJson = {};
    await Promise.all(
        traces.map(async (trace) => {
            //This should use react query to reduce calls
            const traceResponse = await fetch(trace.signed_data_file_url);
            const traceJson = await traceResponse.json();
            returnJson[trace.name] = traceJson;
        })
    )
    return returnJson;
}