// Entry point for the plugin's UI iframe: screen routing, form handling, and
// the end-to-end scan pipeline (fetch trees -> resolve scope -> match ->
// fetch renders -> compute diff% -> hand the finished rows to the main
// thread for placement on the report page).
import type {
  MainToUiMessage,
  ReportRow,
  RowStatus,
  ScopeConfig,
  UiToMainMessage,
} from '../shared/messages';
import {
  fetchFileTree,
  fetchImages,
  parseFigmaUrl,
  validateToken,
  type FigmaFileTree,
} from './figmaApi';
import { resolveScopeTargets } from './scope';
import { matchTargets } from './match';
import { computeDiffPercent } from './diff';
import { DEFAULT_SCALE, DIFF_THRESHOLD_PERCENT } from './uiConfig';

function post(message: UiToMainMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el as T;
}

type ScreenName = 'gate' | 'setup' | 'log';

function showScreen(name: ScreenName): void {
  $('panel-gate').hidden = name !== 'gate';
  $('panel-setup').hidden = name !== 'setup';
  $('panel-log').hidden = name !== 'log';
}

function appendLog(text: string): void {
  const log = $('log-list');
  const item = document.createElement('div');
  item.className = 'log-item';
  item.textContent = text;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

let currentToken: string | null = null;
let selectedScale = DEFAULT_SCALE;
let excludedPageNames: string[] = [];

// Cache of the last fetched Before/After trees, keyed by the URLs that
// produced them, so clicking "スキャン開始" doesn't re-fetch if the user
// already ran "ページ一覧を取得" moments earlier with the same inputs.
let treeCache: { beforeUrl: string; afterUrl: string; before: FigmaFileTree; after: FigmaFileTree } | null = null;

// ---------------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------------

window.onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage as MainToUiMessage | undefined;
  if (!message) return;
  handleMainMessage(message);
};

function handleMainMessage(message: MainToUiMessage): void {
  switch (message.type) {
    case 'token-loaded':
      currentToken = message.token;
      showScreen(message.token ? 'setup' : 'gate');
      break;
    case 'report-progress':
      appendLog(message.message);
      break;
    case 'report-done':
      appendLog(`✓ 新規ページ「${message.pageName}」を作成しました`);
      break;
    case 'report-error':
      appendLog(`✕ エラー: ${message.message}`);
      break;
  }
}

post({ type: 'ui-ready' });

// ---------------------------------------------------------------------------
// Gate screen
// ---------------------------------------------------------------------------

$('gate-connect-btn').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('gate-token-input');
  const status = $('gate-status');
  const token = input.value.trim();
  if (!token) return;

  status.textContent = '接続を確認しています…';
  try {
    const me = await validateToken(token);
    currentToken = token;
    post({ type: 'save-token', token });
    status.textContent = `接続しました（${me.handle}）`;
    showScreen('setup');
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'トークンを確認できませんでした';
  }
});

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

$('change-token-link').addEventListener('click', () => {
  post({ type: 'clear-token' });
  currentToken = null;
  treeCache = null;
  $<HTMLInputElement>('gate-token-input').value = '';
  $('gate-status').textContent = '';
  showScreen('gate');
});

// -- depth stepper --
let depthValue = 1;
function selectDepthN(): void {
  const radio = document.querySelector<HTMLInputElement>('input[name="depth"][value="N"]');
  if (radio) radio.checked = true;
}
$('depth-minus').addEventListener('click', () => {
  depthValue = Math.max(1, depthValue - 1);
  $('depth-stepper-value').textContent = String(depthValue);
  selectDepthN();
});
$('depth-plus').addEventListener('click', () => {
  depthValue = depthValue + 1;
  $('depth-stepper-value').textContent = String(depthValue);
  selectDepthN();
});

// -- render scale segmented control --
$('scale-seg').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button');
  if (!button) return;
  document.querySelectorAll('#scale-seg button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  selectedScale = Number(button.dataset.scale);
});

function readScopeConfig(): ScopeConfig {
  const attributes = Array.from(
    document.querySelectorAll<HTMLInputElement>('.scope-attribute:checked')
  ).map((el) => el.value as ScopeConfig['attributes'][number]);

  const depthMode = document.querySelector<HTMLInputElement>('input[name="depth"]:checked')?.value ?? 'ALL';
  const depth = depthMode === 'ALL' ? 'ALL' : depthValue;

  return { attributes, depth, excludedPageNames };
}

// -- "ページ一覧を取得" -> union of both files' pages, flagged if one-sided --
$('fetch-pages-btn').addEventListener('click', async () => {
  try {
    const { before, after } = await loadTrees();
    renderExcludePages(before, after);
  } catch (error) {
    appendLog(`✕ エラー: ${error instanceof Error ? error.message : String(error)}`);
  }
});

function renderExcludePages(before: FigmaFileTree, after: FigmaFileTree): void {
  const beforeNames = new Set(before.pages.map((p) => p.name));
  const afterNames = new Set(after.pages.map((p) => p.name));
  const allNames = Array.from(new Set([...beforeNames, ...afterNames]));

  const list = $('exclude-pages-list');
  list.innerHTML = '';
  excludedPageNames = [];

  for (const name of allNames) {
    const label = document.createElement('label');
    label.className = 'chip';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      excludedPageNames = checkbox.checked
        ? [...excludedPageNames, name]
        : excludedPageNames.filter((n) => n !== name);
    });
    label.appendChild(checkbox);
    label.append(name);

    if (!beforeNames.has(name)) {
      const flag = document.createElement('span');
      flag.className = 'flag after';
      flag.textContent = 'After限定';
      label.appendChild(flag);
    } else if (!afterNames.has(name)) {
      const flag = document.createElement('span');
      flag.className = 'flag before';
      flag.textContent = 'Before限定';
      label.appendChild(flag);
    }

    list.appendChild(label);
  }

  $('exclude-pages-fieldset').hidden = false;
}

async function loadTrees(): Promise<{ before: FigmaFileTree; after: FigmaFileTree }> {
  if (!currentToken) throw new Error('トークンが未設定です');

  const beforeUrl = $<HTMLInputElement>('before-url-input').value.trim();
  const afterUrl = $<HTMLInputElement>('after-url-input').value.trim();
  if (!beforeUrl || !afterUrl) throw new Error('Before / After のURLを入力してください');

  if (treeCache && treeCache.beforeUrl === beforeUrl && treeCache.afterUrl === afterUrl) {
    return treeCache;
  }

  const beforeVersion = $<HTMLInputElement>('before-version-input').value.trim() || undefined;
  const afterVersion = $<HTMLInputElement>('after-version-input').value.trim() || undefined;
  const beforeKey = parseFigmaUrl(beforeUrl).fileKey;
  const afterKey = parseFigmaUrl(afterUrl).fileKey;

  const [before, after] = await Promise.all([
    fetchFileTree(currentToken, beforeKey, beforeVersion),
    fetchFileTree(currentToken, afterKey, afterVersion),
  ]);

  treeCache = { beforeUrl, afterUrl, before, after };
  return treeCache;
}

// ---------------------------------------------------------------------------
// Scan pipeline
// ---------------------------------------------------------------------------

$('scan-start-btn').addEventListener('click', () => {
  runScan().catch((error) => {
    appendLog(`✕ エラー: ${error instanceof Error ? error.message : String(error)}`);
  });
});

$('back-to-setup-btn').addEventListener('click', () => showScreen('setup'));

async function runScan(): Promise<void> {
  if (!currentToken) throw new Error('トークンが未設定です');
  const token = currentToken;

  const beforeUrl = $<HTMLInputElement>('before-url-input').value.trim();
  const afterUrl = $<HTMLInputElement>('after-url-input').value.trim();
  const beforeVersion = $<HTMLInputElement>('before-version-input').value.trim() || undefined;
  const afterVersion = $<HTMLInputElement>('after-version-input').value.trim() || undefined;
  const scope = readScopeConfig();

  if (scope.attributes.length === 0) throw new Error('属性を1つ以上選択してください');

  $('log-list').innerHTML = '';
  showScreen('log');
  appendLog('スコープを解決しています…');

  const beforeKey = parseFigmaUrl(beforeUrl).fileKey;
  const afterKey = parseFigmaUrl(afterUrl).fileKey;
  const { before, after } = await loadTrees();

  const beforeTargets = resolveScopeTargets(before.pages, scope);
  const afterTargets = resolveScopeTargets(after.pages, scope);
  const pairs = matchTargets(beforeTargets, afterTargets);
  appendLog(`対象を検出しました（Before ${beforeTargets.length}件 / After ${afterTargets.length}件 / 対応 ${pairs.length}件）`);

  appendLog('レンダリングを取得しています…');
  const beforeIds = pairs.flatMap((p) => (p.before ? [p.before.nodeId] : []));
  const afterIds = pairs.flatMap((p) => (p.after ? [p.after.nodeId] : []));

  const [beforeImages, afterImages] = await Promise.all([
    fetchImages(token, beforeKey, beforeIds, selectedScale, beforeVersion, (done, total) =>
      appendLog(`Before レンダリング取得中… ${done}/${total}`)
    ),
    fetchImages(token, afterKey, afterIds, selectedScale, afterVersion, (done, total) =>
      appendLog(`After レンダリング取得中… ${done}/${total}`)
    ),
  ]);

  appendLog('差分を算出しています…');
  const rows: ReportRow[] = [];
  for (const pair of pairs) {
    const beforePng = pair.before ? beforeImages.get(pair.before.nodeId)?.bytes ?? null : null;
    const afterPng = pair.after ? afterImages.get(pair.after.nodeId)?.bytes ?? null : null;

    let status: RowStatus;
    let diffPercent: number | null = null;

    if (pair.before && !pair.after) {
      status = 'REMOVED';
    } else if (!pair.before && pair.after) {
      status = 'ADDED';
    } else if (beforePng && afterPng) {
      diffPercent = await computeDiffPercent(beforePng, afterPng);
      status = diffPercent > DIFF_THRESHOLD_PERCENT ? 'MATCHED_DIFF' : 'MATCHED_SAME';
    } else {
      // Render failed on one side (e.g. an invisible layer) -- surface it as
      // a diff rather than silently dropping the row.
      status = 'MATCHED_DIFF';
    }

    const reference = pair.before ?? pair.after!;
    rows.push({
      status,
      name: reference.name,
      path: reference.path,
      pageName: reference.pageName,
      diffPercent,
      beforePng: beforePng ?? null,
      afterPng: afterPng ?? null,
    });
  }

  const diffCount = rows.filter((r) => r.status === 'MATCHED_DIFF' || r.status === 'REMOVED').length;
  appendLog(`判定が完了しました（差分あり ${diffCount}件 / 差分なし ${rows.length - diffCount}件）`);
  appendLog('レポートページを作成しています…');

  post({
    type: 'build-report',
    meta: {
      title: `Full Diff Checker Report — ${new Date().toLocaleString('ja-JP')}`,
      beforeLabel: beforeVersion ? `${beforeUrl} @ ${beforeVersion}` : beforeUrl,
      afterLabel: afterVersion ? `${afterUrl} @ ${afterVersion}` : afterUrl,
      thresholdPercent: DIFF_THRESHOLD_PERCENT,
    },
    rows,
  });
}
