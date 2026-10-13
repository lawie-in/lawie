/**
 * T-375: the two free tools' on/off flags, read on the server from the public
 * drafting endpoint GET /api/sections/features (Arjun, 13 Oct 2026). UX only:
 * the tool APIs 404 on the server when off whatever this says.
 *
 * Any failure (network, non-2xx, a bad body) reads as both tools OFF.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ToolFeatures {
  tool_timeline: boolean;
  tool_bail_checker: boolean;
}

const ALL_OFF: ToolFeatures = { tool_timeline: false, tool_bail_checker: false };

export async function getToolFeatures(): Promise<ToolFeatures> {
  try {
    const res = await fetch(`${API_URL}/api/sections/features`, { next: { revalidate: 60 } });
    if (!res.ok) return ALL_OFF;
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object') return ALL_OFF;
    const b = body as Record<string, unknown>;
    return {
      tool_timeline: b.tool_timeline === true,
      tool_bail_checker: b.tool_bail_checker === true,
    };
  } catch {
    return ALL_OFF;
  }
}
