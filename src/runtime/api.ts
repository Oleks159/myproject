const configuredOrigin = String(import.meta.env.VITE_API_ORIGIN || '').trim().replace(/\/+$/, '');
const sessionKey = 'tpf_preview_session';

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${configuredOrigin}${normalizedPath}`;
}

export function previewSessionHeaders() {
  try {
    const session = localStorage.getItem(sessionKey);
    return session ? { 'X-TPF-Session': session } : {};
  } catch {
    return {};
  }
}

export function rememberApiSession(response: Response) {
  const session = response.headers.get('X-TPF-Session');
  if (!session) return;
  try { localStorage.setItem(sessionKey, session); } catch { /* The current page still works without persistence. */ }
}
