export const fetchProjectHistory = async (_projectId) => {
    return fetch("/data/project_history.json").then(res =>
        res.json()
    )
}
