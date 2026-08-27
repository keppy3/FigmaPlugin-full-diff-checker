// Builds the actual deliverable: a new Figma page in the scanned file,
// containing one real node per scanned row (image fills + a native
// blendMode:"DIFFERENCE" overlay), instead of a table rendered inside the
// plugin's HTML window. See spec.md section 9-10 for why.
import type { ReportMeta, ReportRow, RowStatus } from '../../shared/messages';
import { COLOR, REPORT_PAGE_WIDTH, ROW_GAP, ROW_PADDING_Y, STAGE_HEIGHT, STAGE_WIDTH } from '../config';

const FONT_REGULAR: FontName = { family: 'Inter', style: 'Regular' };
const FONT_BOLD: FontName = { family: 'Inter', style: 'Bold' };

const STATUS_LABEL: Record<RowStatus, string> = {
  MATCHED_DIFF: '変化あり',
  MATCHED_SAME: '変化なし',
  REMOVED: '🗑 削除',
  ADDED: '✨ 新規追加',
};

const STATUS_COLOR: Record<RowStatus, { bg: RGB; fg: RGB }> = {
  MATCHED_DIFF: { bg: COLOR.statusDiffBg, fg: COLOR.statusDiffFg },
  MATCHED_SAME: { bg: COLOR.statusSameBg, fg: COLOR.statusSameFg },
  REMOVED: { bg: COLOR.statusDiffBg, fg: COLOR.statusDiffFg },
  ADDED: { bg: COLOR.statusAddedBg, fg: COLOR.statusAddedFg },
};

export async function buildReportPage(meta: ReportMeta, rows: ReportRow[]): Promise<PageNode> {
  await figma.loadFontAsync(FONT_REGULAR);
  await figma.loadFontAsync(FONT_BOLD);

  const page = figma.createPage();
  page.name = meta.title;
  // Switch to the new page *before* creating any nodes below, so they land
  // there directly instead of needing to be reparented afterwards.
  figma.currentPage = page;

  const root = figma.createFrame();
  root.name = 'Report';
  root.layoutMode = 'VERTICAL';
  root.itemSpacing = ROW_GAP;
  root.paddingLeft = root.paddingRight = root.paddingTop = root.paddingBottom = 32;
  root.primaryAxisSizingMode = 'AUTO';
  root.counterAxisSizingMode = 'FIXED';
  root.resize(REPORT_PAGE_WIDTH, 100);
  root.fills = [{ type: 'SOLID', color: COLOR.white }];

  root.appendChild(buildHeader(meta, rows));

  for (const row of rows) {
    root.appendChild(buildRow(row));
  }

  figma.viewport.scrollAndZoomIntoView([root]);
  return page;
}

function buildHeader(meta: ReportMeta, rows: ReportRow[]): FrameNode {
  const diffCount = rows.filter((r) => r.status === 'MATCHED_DIFF' || r.status === 'REMOVED').length;

  const header = figma.createFrame();
  header.name = 'Header';
  header.layoutMode = 'VERTICAL';
  header.itemSpacing = 6;
  header.primaryAxisSizingMode = 'AUTO';
  header.counterAxisSizingMode = 'AUTO';
  header.fills = [];
  header.paddingBottom = 12;

  header.appendChild(makeText(meta.title, FONT_BOLD, 20, { r: 0.078, g: 0.086, b: 0.106 }));
  header.appendChild(
    makeText(
      `Before: ${meta.beforeLabel}　→　After: ${meta.afterLabel}　・　${rows.length}件中${diffCount}件に差分　・　しきい値${meta.thresholdPercent}%`,
      FONT_REGULAR,
      12,
      COLOR.textMuted
    )
  );

  return header;
}

function buildRow(row: ReportRow): FrameNode {
  const wrapper = figma.createFrame();
  wrapper.name = row.name;
  wrapper.layoutMode = 'HORIZONTAL';
  wrapper.counterAxisAlignItems = 'CENTER';
  wrapper.itemSpacing = 16;
  wrapper.primaryAxisSizingMode = 'FIXED';
  wrapper.counterAxisSizingMode = 'AUTO';
  wrapper.resize(REPORT_PAGE_WIDTH - 64, 100);
  wrapper.fills = [];
  wrapper.paddingTop = wrapper.paddingBottom = ROW_PADDING_Y;
  wrapper.strokes = [{ type: 'SOLID', color: COLOR.rowDivider }];
  wrapper.strokeTopWeight = 0;
  wrapper.strokeLeftWeight = 0;
  wrapper.strokeRightWeight = 0;
  wrapper.strokeBottomWeight = 1;
  wrapper.strokeAlign = 'INSIDE';

  wrapper.appendChild(buildStatusPill(row.status));
  wrapper.appendChild(buildNameBlock(row));
  wrapper.appendChild(buildStagePair(row));
  wrapper.appendChild(buildDiffStage(row));
  wrapper.appendChild(buildPercentText(row));

  return wrapper;
}

function buildStatusPill(status: RowStatus): FrameNode {
  const { bg, fg } = STATUS_COLOR[status];

  const pill = figma.createFrame();
  pill.name = 'Status';
  pill.layoutMode = 'HORIZONTAL';
  pill.primaryAxisSizingMode = 'AUTO';
  pill.counterAxisSizingMode = 'AUTO';
  pill.paddingLeft = pill.paddingRight = 10;
  pill.paddingTop = pill.paddingBottom = 5;
  pill.cornerRadius = 100;
  pill.fills = [{ type: 'SOLID', color: bg }];

  pill.appendChild(makeText(STATUS_LABEL[status], FONT_BOLD, 11, fg));
  return pill;
}

function buildNameBlock(row: ReportRow): FrameNode {
  const block = figma.createFrame();
  block.name = 'Name';
  block.layoutMode = 'VERTICAL';
  block.itemSpacing = 2;
  block.primaryAxisSizingMode = 'AUTO';
  block.counterAxisSizingMode = 'FIXED';
  block.resize(200, 10);
  block.fills = [];

  block.appendChild(makeText(row.name, FONT_BOLD, 12, { r: 0.078, g: 0.086, b: 0.106 }));
  block.appendChild(makeText(`${row.pageName} / ${row.path}`, FONT_REGULAR, 10, COLOR.textMuted));
  return block;
}

function buildImageStage(bytes: Uint8Array | null): RectangleNode {
  const rect = figma.createRectangle();
  rect.resize(STAGE_WIDTH, STAGE_HEIGHT);
  rect.cornerRadius = 6;
  rect.strokes = [{ type: 'SOLID', color: COLOR.border }];
  rect.strokeWeight = 1;

  if (bytes && bytes.length > 0) {
    const image = figma.createImage(bytes);
    rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FIT' }];
  } else {
    rect.fills = [{ type: 'SOLID', color: COLOR.emptyStageBg }];
  }
  return rect;
}

function buildStagePair(row: ReportRow): FrameNode {
  const pair = figma.createFrame();
  pair.name = 'BeforeAfter';
  pair.layoutMode = 'HORIZONTAL';
  pair.counterAxisAlignItems = 'CENTER';
  pair.itemSpacing = 8;
  pair.primaryAxisSizingMode = 'AUTO';
  pair.counterAxisSizingMode = 'AUTO';
  pair.fills = [];

  pair.appendChild(buildImageStage(row.beforePng));
  pair.appendChild(makeText('→', FONT_REGULAR, 12, COLOR.textMuted));
  pair.appendChild(buildImageStage(row.afterPng));
  return pair;
}

function buildDiffStage(row: ReportRow): FrameNode {
  // No layoutMode here on purpose: the two image rects are stacked at the
  // same (0,0) position rather than laid out side by side, so the top
  // layer's blendMode:"DIFFERENCE" composites directly against the bottom
  // one. This is Figma's own renderer doing the diff, not a baked-in image.
  const stage = figma.createFrame();
  stage.name = 'Diff';
  stage.resize(STAGE_WIDTH, STAGE_HEIGHT);
  stage.cornerRadius = 6;
  stage.clipsContent = true;
  stage.fills = [{ type: 'SOLID', color: COLOR.white }];
  stage.strokes = [{ type: 'SOLID', color: COLOR.border }];
  stage.strokeWeight = 1;

  if (row.beforePng && row.afterPng) {
    const before = buildImageStage(row.beforePng);
    before.x = 0;
    before.y = 0;
    stage.appendChild(before);

    const after = buildImageStage(row.afterPng);
    after.x = 0;
    after.y = 0;
    after.blendMode = 'DIFFERENCE';
    stage.appendChild(after);
  } else {
    stage.appendChild(makeCenteredNote(stage, '対応なし'));
  }

  return stage;
}

function makeCenteredNote(stage: FrameNode, label: string): TextNode {
  const text = makeText(label, FONT_REGULAR, 10, COLOR.textMuted);
  text.textAlignHorizontal = 'CENTER';
  text.resize(stage.width, text.height);
  text.x = 0;
  text.y = (stage.height - text.height) / 2;
  return text;
}

function buildPercentText(row: ReportRow): TextNode {
  const label = row.diffPercent === null ? '—' : `${row.diffPercent.toFixed(2)}%`;
  const color =
    row.status === 'MATCHED_SAME' ? COLOR.statusSameFg
    : row.status === 'MATCHED_DIFF' || row.status === 'REMOVED' ? COLOR.statusDiffFg
    : COLOR.textMuted;
  return makeText(label, FONT_BOLD, 12, color);
}

function makeText(characters: string, font: FontName, size: number, color: RGB): TextNode {
  const text = figma.createText();
  text.fontName = font;
  text.fontSize = size;
  text.fills = [{ type: 'SOLID', color }];
  text.characters = characters;
  return text;
}
