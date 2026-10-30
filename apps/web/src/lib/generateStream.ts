/**
 * T-705: the SSE reader of a draft stream (generate-from-brief, and a revision), moved out of
 * OneFlow.tsx unchanged so the revise dialog reads the same events the same way.
 *
 * Each `event: <name>` line names the next `data:` line; a data line with no event name is a
 * text chunk (event ''). A data line that is not JSON is skipped and resets the name. After
 * each data line the name resets. `onEvent` returning `false` stops reading (the stream is not
 * cancelled, as before).
 */
export async function readSseEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, payload: Record<string, unknown>) => boolean | void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  for (;;) {
    const { done: ended, value } = await reader.read();
    if (ended) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith('data: ')) continue;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(line.slice(6)) as Record<string, unknown>;
      } catch {
        event = '';
        continue;
      }
      const name = event;
      event = '';
      if (onEvent(name, payload) === false) return;
    }
  }
}
