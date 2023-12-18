import { throwError } from "../api/utils";
import { fetchProject } from "../api/project"
import { fetchTraces } from "../api/traces"

export const loadProject = async () => {
    const project = await fetchProject()
    if (project) {
        return { project, fetchTraces }
    } else {
        throwError('Project not found.', 404);
    }
}