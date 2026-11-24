const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

export async function readJsonBody(c) {
  const request = c.req.raw;
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    await request.body?.cancel();
    return { response: c.json({ error: 'Request body too large' }, 413) };
  }

  if (!request.body) return { value: {} };

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      return { response: c.json({ error: 'Request body too large' }, 413) };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(bytes);
  if (!text) return { value: {} };

  try {
    return { value: JSON.parse(text) };
  } catch {
    return { response: c.json({ error: 'Invalid JSON body' }, 400) };
  }
}
