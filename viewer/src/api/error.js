export const fetchError = async () => {
    const response = await fetch('/data/error.json');
    if (response.status === 200) {
        return await response.json();
    } else {
        return null
    }
}
