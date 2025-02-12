export const fetchProject = async () => {
    const response = await fetch('/data/project.json');
    if (response.status === 200) {
        return await response.json();
    } else {
        return null
    }
}