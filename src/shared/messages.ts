// Typed contract for postMessage traffic between the UI iframe (src/ui) and
// the plugin's sandboxed main thread (src/main). Keeping this in one shared
// file means a change to either side's expectations shows up as a type error
// on the other side instead of a silent runtime mismatch.

export type ScopeAttribute = 'MAIN_COMPONENT' | 'INSTANCE_COMPONENT' | 'SECTION' | 'FRAME';

export interface ScopeConfig {
  attributes: ScopeAttribute[];
  /** 'ALL' or a 1-indexed depth, where a page's direct children are depth 1. */
  depth: 'ALL' | number;
  excludedPageNames: string[];
}

export interface ScanTarget {
  /** Figma node id, used to request renders from the REST API. */
  nodeId: string;
  /**
   * Identifier used to pair this node up with its counterpart on the other
   * side (Before <-> After). `component.key` for components/component sets
   * (stable across branches and republish), otherwise "page / path / name".
   */
  matchKey: string;
  name: string;
  path: string;
  pageName: string;
}

export type RowStatus = 'MATCHED_DIFF' | 'MATCHED_SAME' | 'REMOVED' | 'ADDED';

export interface ReportRow {
  status: RowStatus;
  name: string;
  path: string;
  pageName: string;
  /** null for REMOVED / ADDED rows, where there is nothing to compare against. */
  diffPercent: number | null;
  beforePng: Uint8Array | null;
  afterPng: Uint8Array | null;
}

export interface ReportMeta {
  title: string;
  beforeLabel: string;
  afterLabel: string;
  thresholdPercent: number;
}

// ---- UI -> Main ----
export type UiToMainMessage =
  | { type: 'ui-ready' }
  | { type: 'save-token'; token: string }
  | { type: 'clear-token' }
  | { type: 'build-report'; meta: ReportMeta; rows: ReportRow[] };

// ---- Main -> UI ----
export type MainToUiMessage =
  | { type: 'token-loaded'; token: string | null }
  | { type: 'report-progress'; message: string }
  | { type: 'report-done'; pageName: string }
  | { type: 'report-error'; message: string };
