export const fetchDag = async () => {
    const response = await fetch('/data/dag.json');
    if (response.status === 200) {
        return await response.json();
    } else {
        return null
    }
}
