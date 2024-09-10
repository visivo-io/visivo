import { throwError } from "../api/utils";
import { fetchProject } from "../api/project"

export const loadProject = async () => {
    const project = await fetchProject()
    if (project) {
        console.log(project)
        return project
    } else {
        throwError('Project not found.', 404);
    }
}