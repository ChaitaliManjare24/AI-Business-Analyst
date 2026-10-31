/** Thin API client. All requests are same-origin and cookie-authenticated. */

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, { method = 'GET', body, formData, signal } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {}, signal };
  if (formData) {
    opts.body = formData;
  } else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check that it is running and try again.', 0);
  }
  const type = res.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    throw new ApiError(payload.error || `Request failed (${res.status}).`, res.status, payload);
  }
  return payload;
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  del: (p, body, o) => request(p, { ...o, method: 'DELETE', body }),
  upload: (p, formData, o) => request(p, { ...o, method: 'POST', formData }),
  ApiError
};
