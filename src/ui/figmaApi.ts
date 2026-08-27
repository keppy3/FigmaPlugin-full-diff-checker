// Thin wrapper around the Figma REST API. This is the only place in the
// codebase that knows about endpoint shapes, so an API version bump or a
// change in how we authenticate only touches this file.
import { throttleTier1 } from './rateLimiter';

const API_BASE = 'https://api.figma.com';
const IMAGE_BATCH_SIZE = 40; // one /v1/images call can render many node ids at once

export interface ParsedFigmaUrl {
  fileKey: string;
}

/**
 * Figma file/branch URLs look like:
 *   https://www.figma.com/design/<fileKey>/<name>?...
 *   https://www.figma.com/file/<fileKey>/<name>?...
 * A branch is a different file key under the same URL shape (you get that
 * URL by switching to the branch in the browser first), so no separate
 * branch-parsing step is needed here.
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  const match = url.match(/figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error(`FigmaのファイルURLとして解釈できませんでした: ${url}`);
  }
  return { fileKey: match[1] };
}

function authHeaders(token: string): HeadersInit {
  return { 'X-Figma-Token': token };
}

async function apiFetch(token: string, path: string, params?: Record<string, string | undefined>): Promise<any> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  await throttleTier1();
  const res = await fetch(url.toString(), { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Figma API ${res.status}: ${path}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

export async function validateToken(token: string): Promise<{ email: string; handle: string }> {
  const data = await apiFetch(token, '/v1/me');
  return { email: data.email, handle: data.handle };
}

export interface FigmaNodeSummary {
  id: string;
  name: string;
  type: string;
  /** Present only on COMPONENT / COMPONENT_SET nodes; stable across branches and republish. */
  componentKey?: string;
  children?: FigmaNodeSummary[];
}

export interface FigmaFileTree {
  fileName: string;
  pages: FigmaNodeSummary[];
}

export async function fetchFileTree(token: string, fileKey: string, versionId?: string): Promise<FigmaFileTree> {
  const data = await apiFetch(token, `/v1/files/${fileKey}`, { version: versionId });
  const pages: FigmaNodeSummary[] = (data.document?.children ?? []).map(toSummary);
  return { fileName: data.name, pages };
}

function toSummary(node: any): FigmaNodeSummary {
  const isComponentLike = node.type === 'COMPONENT' || node.type === 'COMPONENT_SET';
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    componentKey: isComponentLike ? node.key : undefined,
    children: Array.isArray(node.children) ? node.children.map(toSummary) : undefined,
  };
}

export interface FigmaVersionSummary {
  id: string;
  createdAt: string;
  label: string | null;
  userName: string;
}

export async function fetchFileVersions(token: string, fileKey: string): Promise<FigmaVersionSummary[]> {
  const data = await apiFetch(token, `/v1/files/${fileKey}/versions`);
  return (data.versions ?? []).map((v: any) => ({
    id: v.id,
    createdAt: v.created_at,
    label: v.label ?? null,
    userName: v.user?.handle ?? '不明なユーザー',
  }));
}

export interface FetchedImage {
  bytes: Uint8Array;
}

/**
 * Renders `nodeIds` from `fileKey` (optionally pinned to `versionId`) as PNG
 * at `scale`, batching many ids into each /v1/images call so a large scan
 * doesn't need one request per node. See rateLimiter.ts for pacing.
 */
export async function fetchImages(
  token: string,
  fileKey: string,
  nodeIds: string[],
  scale: number,
  versionId: string | undefined,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, FetchedImage>> {
  const result = new Map<string, FetchedImage>();

  for (let i = 0; i < nodeIds.length; i += IMAGE_BATCH_SIZE) {
    const batch = nodeIds.slice(i, i + IMAGE_BATCH_SIZE);
    const data = await apiFetch(token, `/v1/images/${fileKey}`, {
      ids: batch.join(','),
      format: 'png',
      scale: String(scale),
      version: versionId,
    });

    if (data.err) {
      throw new Error(`画像の書き出しに失敗しました: ${data.err}`);
    }

    await Promise.all(
      batch.map(async (id) => {
        const imageUrl = data.images?.[id];
        // A null URL means Figma couldn't render this specific node (e.g. it
        // has zero opacity or was deleted mid-scan) -- skip it rather than fail
        // the whole batch, the caller treats a missing entry as "no image".
        if (!imageUrl) return;
        const imgRes = await fetch(imageUrl);
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        result.set(id, { bytes });
      })
    );

    onProgress?.(Math.min(i + IMAGE_BATCH_SIZE, nodeIds.length), nodeIds.length);
  }

  return result;
}
