/* Thin wrappers over the existing Flask endpoints used by the legacy
   onboarding component. Kept in one place so the flow component stays
   declarative. */

function safeAppend(form, key, value) {
  form.append(key, value ?? '');
}

export async function createSource({ projectName, projectDir, config }) {
  const formData = new FormData();
  safeAppend(formData, 'project_name', projectName);
  safeAppend(formData, 'source_name', config?.name);
  safeAppend(formData, 'source_type', config?.type);
  safeAppend(formData, 'port', config?.port);
  safeAppend(formData, 'database', config?.database);
  safeAppend(formData, 'host', config?.host);
  safeAppend(formData, 'username', config?.username);
  safeAppend(formData, 'password', config?.password);
  safeAppend(formData, 'account', config?.account);
  safeAppend(formData, 'warehouse', config?.warehouse);
  safeAppend(formData, 'credentials_base64', config?.credentials_base64);
  safeAppend(formData, 'project', config?.project);
  safeAppend(formData, 'dataset', config?.dataset);
  safeAppend(formData, 'project_dir', projectDir);

  const res = await fetch('/api/source/create/', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to connect to the data source.');
  return data.source;
}

export async function uploadSourceFile({ projectDir, config }) {
  const formData = new FormData();
  formData.append('file', config.file);
  formData.append('project_dir', projectDir);
  formData.append('source_type', config?.type);

  const res = await fetch('/api/source/upload/', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to upload the file.');
  return data.dashboard;
}

export async function finalizeProject({ projectName, projectDir, sources, dashboards }) {
  const res = await fetch('/api/project/finalize/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_name: projectName,
      project_dir: projectDir,
      sources: sources || [],
      dashboards: dashboards || [],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to finalize the project.');
  return data;
}

export async function loadExample({ projectName, projectDir, exampleType }) {
  const res = await fetch('/api/project/load_example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_name: projectName,
      project_dir: projectDir,
      example_type: exampleType,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to import the example dashboard.');
  }
  return true;
}
