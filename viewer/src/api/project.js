export const fetchProject = async () => {
    const response = await fetch('/data/project.json');
    if (response.status === 200) {
        return await response.json();
    } else {
        return null
    }
}

export const fetchExplorer = async () => {
    const response = await fetch('/data/explorer.json');
    if (response.status === 200) {
        const data = await response.json();
        return data;
    } else {
        console.error('Failed to fetch explorer data');
        return null
    }
}
