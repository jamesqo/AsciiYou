export function loadStaticContent(path: string) : Promise<Response> {
    const baseUrl = import.meta.env.VITE_BASE_URL; // ends with a slash
    const fullPath = `${baseUrl}${path}`;
    return fetch(fullPath);
}

export async function loadStaticBlob(path: string) : Promise<Blob> {
    const res = await loadStaticContent(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return await res.blob();
}

export async function loadStaticText(path: string) : Promise<string> {
    const res = await loadStaticContent(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return await res.text();
}
