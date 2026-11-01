// Local synthetic model fixture. It never calls the external model service.
const realFetch = globalThis.fetch;
function aborted(signal) {
  return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}
globalThis.fetch = async (input, init) => {
  const url = String(input?.url ?? input);
  if (!url.startsWith('https://api.anthropic.com/')) return realFetch(input, init);
  const note = JSON.parse(init.body).messages[0].content;
  const mode = /\[TEST:([a-z-]+)\]/.exec(note)?.[1] ?? 'valid';
  console.log('[synthetic model]', mode, 'signal:', Boolean(init.signal));
  if (mode === 'hang') {
    return new Promise((resolve, reject) => {
      if (init.signal?.aborted) reject(aborted(init.signal));
      else init.signal?.addEventListener('abort', () => reject(aborted(init.signal)), { once: true });
    });
  }
  if (mode === 'body-hang') {
    return new Response(new ReadableStream({ start(controller) {
      init.signal?.addEventListener('abort', () => controller.error(aborted(init.signal)), { once: true });
    }}), { headers: { 'content-type': 'application/json' } });
  }
  if (mode === 'rate-limit') return Response.json({ error: { message: 'Synthetic rate limit' } }, { status: 429 });
  if (mode === 'quota') return Response.json({ error: { message: 'Synthetic exhausted credit' } }, { status: 400 });
  const raw = mode === 'array' ? '[]' : mode === 'primitive' ? '7' : mode === 'invalid-json' ? 'invalid' : JSON.stringify({ situation: 'hackathon', automatic_thought: null, emotion_labels: ['nervous'], emotion_intensity: 5, behavior: null, carries_state: true });
  return Response.json({ content: [{ type: 'text', text: raw }] });
};
