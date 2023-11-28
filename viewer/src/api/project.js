export const fetchProject = async () => {
    const response = await fetch('/api/projects/');
    if (response.status === 200) {
        return await response.json();
    } else {
        return null
    }
}
