"use strict";
(() => {
  // src/main/storage.ts
  var TOKEN_KEY = "full-diff-checker.pat";
  async function loadToken() {
    const value = await figma.clientStorage.getAsync(TOKEN_KEY);
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  async function saveToken(token) {
    await figma.clientStorage.setAsync(TOKEN_KEY, token);
  }
  async function clearToken() {
    await figma.clientStorage.setAsync(TOKEN_KEY, "");
  }

  // src/main/config.ts
  var REPORT_PAGE_WIDTH = 1200;
  var ROW_GAP = 4;
  var ROW_PADDING_Y = 14;
  var STAGE_WIDTH = 160;
  var STAGE_HEIGHT = 104;
  var COLOR = {
    white: { r: 1, g: 1, b: 1 },
    border: { r: 0.859, g: 0.875, b: 0.902 },
    textMuted: { r: 0.541, g: 0.565, b: 0.627 },
    rowDivider: { r: 0.925, g: 0.933, b: 0.953 },
    emptyStageBg: { r: 0.976, g: 0.976, b: 0.98 },
    statusDiffBg: { r: 0.984, g: 0.906, b: 0.894 },
    statusDiffFg: { r: 0.706, g: 0.137, b: 0.094 },
    statusSameBg: { r: 0.906, g: 0.965, b: 0.937 },
    statusSameFg: { r: 0.071, g: 0.502, b: 0.361 },
    statusAddedBg: { r: 0.933, g: 0.941, b: 1 },
    statusAddedFg: { r: 0.31, g: 0.275, b: 0.898 }
  };

  // src/main/report/buildReportPage.ts
  var FONT_REGULAR = { family: "Inter", style: "Regular" };
  var FONT_BOLD = { family: "Inter", style: "Bold" };
  var STATUS_LABEL = {
    MATCHED_DIFF: "\u5909\u5316\u3042\u308A",
    MATCHED_SAME: "\u5909\u5316\u306A\u3057",
    REMOVED: "\u{1F5D1} \u524A\u9664",
    ADDED: "\u2728 \u65B0\u898F\u8FFD\u52A0"
  };
  var STATUS_COLOR = {
    MATCHED_DIFF: { bg: COLOR.statusDiffBg, fg: COLOR.statusDiffFg },
    MATCHED_SAME: { bg: COLOR.statusSameBg, fg: COLOR.statusSameFg },
    REMOVED: { bg: COLOR.statusDiffBg, fg: COLOR.statusDiffFg },
    ADDED: { bg: COLOR.statusAddedBg, fg: COLOR.statusAddedFg }
  };
  async function buildReportPage(meta, rows) {
    await figma.loadFontAsync(FONT_REGULAR);
    await figma.loadFontAsync(FONT_BOLD);
    const page = figma.createPage();
    page.name = meta.title;
    figma.currentPage = page;
    const root = figma.createFrame();
    root.name = "Report";
    root.layoutMode = "VERTICAL";
    root.itemSpacing = ROW_GAP;
    root.paddingLeft = root.paddingRight = root.paddingTop = root.paddingBottom = 32;
    root.primaryAxisSizingMode = "AUTO";
    root.counterAxisSizingMode = "FIXED";
    root.resize(REPORT_PAGE_WIDTH, 100);
    root.fills = [{ type: "SOLID", color: COLOR.white }];
    root.appendChild(buildHeader(meta, rows));
    for (const row of rows) {
      root.appendChild(buildRow(row));
    }
    figma.viewport.scrollAndZoomIntoView([root]);
    return page;
  }
  function buildHeader(meta, rows) {
    const diffCount = rows.filter((r) => r.status === "MATCHED_DIFF" || r.status === "REMOVED").length;
    const header = figma.createFrame();
    header.name = "Header";
    header.layoutMode = "VERTICAL";
    header.itemSpacing = 6;
    header.primaryAxisSizingMode = "AUTO";
    header.counterAxisSizingMode = "AUTO";
    header.fills = [];
    header.paddingBottom = 12;
    header.appendChild(makeText(meta.title, FONT_BOLD, 20, { r: 0.078, g: 0.086, b: 0.106 }));
    header.appendChild(
      makeText(
        `Before: ${meta.beforeLabel}\u3000\u2192\u3000After: ${meta.afterLabel}\u3000\u30FB\u3000${rows.length}\u4EF6\u4E2D${diffCount}\u4EF6\u306B\u5DEE\u5206\u3000\u30FB\u3000\u3057\u304D\u3044\u5024${meta.thresholdPercent}%`,
        FONT_REGULAR,
        12,
        COLOR.textMuted
      )
    );
    return header;
  }
  function buildRow(row) {
    const wrapper = figma.createFrame();
    wrapper.name = row.name;
    wrapper.layoutMode = "HORIZONTAL";
    wrapper.counterAxisAlignItems = "CENTER";
    wrapper.itemSpacing = 16;
    wrapper.primaryAxisSizingMode = "FIXED";
    wrapper.counterAxisSizingMode = "AUTO";
    wrapper.resize(REPORT_PAGE_WIDTH - 64, 100);
    wrapper.fills = [];
    wrapper.paddingTop = wrapper.paddingBottom = ROW_PADDING_Y;
    wrapper.strokes = [{ type: "SOLID", color: COLOR.rowDivider }];
    wrapper.strokeTopWeight = 0;
    wrapper.strokeLeftWeight = 0;
    wrapper.strokeRightWeight = 0;
    wrapper.strokeBottomWeight = 1;
    wrapper.strokeAlign = "INSIDE";
    wrapper.appendChild(buildStatusPill(row.status));
    wrapper.appendChild(buildNameBlock(row));
    wrapper.appendChild(buildStagePair(row));
    wrapper.appendChild(buildDiffStage(row));
    wrapper.appendChild(buildPercentText(row));
    return wrapper;
  }
  function buildStatusPill(status) {
    const { bg, fg } = STATUS_COLOR[status];
    const pill = figma.createFrame();
    pill.name = "Status";
    pill.layoutMode = "HORIZONTAL";
    pill.primaryAxisSizingMode = "AUTO";
    pill.counterAxisSizingMode = "AUTO";
    pill.paddingLeft = pill.paddingRight = 10;
    pill.paddingTop = pill.paddingBottom = 5;
    pill.cornerRadius = 100;
    pill.fills = [{ type: "SOLID", color: bg }];
    pill.appendChild(makeText(STATUS_LABEL[status], FONT_BOLD, 11, fg));
    return pill;
  }
  function buildNameBlock(row) {
    const block = figma.createFrame();
    block.name = "Name";
    block.layoutMode = "VERTICAL";
    block.itemSpacing = 2;
    block.primaryAxisSizingMode = "AUTO";
    block.counterAxisSizingMode = "FIXED";
    block.resize(200, 10);
    block.fills = [];
    block.appendChild(makeText(row.name, FONT_BOLD, 12, { r: 0.078, g: 0.086, b: 0.106 }));
    block.appendChild(makeText(`${row.pageName} / ${row.path}`, FONT_REGULAR, 10, COLOR.textMuted));
    return block;
  }
  function buildImageStage(bytes) {
    const rect = figma.createRectangle();
    rect.resize(STAGE_WIDTH, STAGE_HEIGHT);
    rect.cornerRadius = 6;
    rect.strokes = [{ type: "SOLID", color: COLOR.border }];
    rect.strokeWeight = 1;
    if (bytes && bytes.length > 0) {
      const image = figma.createImage(bytes);
      rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
    } else {
      rect.fills = [{ type: "SOLID", color: COLOR.emptyStageBg }];
    }
    return rect;
  }
  function buildStagePair(row) {
    const pair = figma.createFrame();
    pair.name = "BeforeAfter";
    pair.layoutMode = "HORIZONTAL";
    pair.counterAxisAlignItems = "CENTER";
    pair.itemSpacing = 8;
    pair.primaryAxisSizingMode = "AUTO";
    pair.counterAxisSizingMode = "AUTO";
    pair.fills = [];
    pair.appendChild(buildImageStage(row.beforePng));
    pair.appendChild(makeText("\u2192", FONT_REGULAR, 12, COLOR.textMuted));
    pair.appendChild(buildImageStage(row.afterPng));
    return pair;
  }
  function buildDiffStage(row) {
    const stage = figma.createFrame();
    stage.name = "Diff";
    stage.resize(STAGE_WIDTH, STAGE_HEIGHT);
    stage.cornerRadius = 6;
    stage.clipsContent = true;
    stage.fills = [{ type: "SOLID", color: COLOR.white }];
    stage.strokes = [{ type: "SOLID", color: COLOR.border }];
    stage.strokeWeight = 1;
    if (row.beforePng && row.afterPng) {
      const before = buildImageStage(row.beforePng);
      before.x = 0;
      before.y = 0;
      stage.appendChild(before);
      const after = buildImageStage(row.afterPng);
      after.x = 0;
      after.y = 0;
      after.blendMode = "DIFFERENCE";
      stage.appendChild(after);
    } else {
      stage.appendChild(makeCenteredNote(stage, "\u5BFE\u5FDC\u306A\u3057"));
    }
    return stage;
  }
  function makeCenteredNote(stage, label) {
    const text = makeText(label, FONT_REGULAR, 10, COLOR.textMuted);
    text.textAlignHorizontal = "CENTER";
    text.resize(stage.width, text.height);
    text.x = 0;
    text.y = (stage.height - text.height) / 2;
    return text;
  }
  function buildPercentText(row) {
    const label = row.diffPercent === null ? "\u2014" : `${row.diffPercent.toFixed(2)}%`;
    const color = row.status === "MATCHED_SAME" ? COLOR.statusSameFg : row.status === "MATCHED_DIFF" || row.status === "REMOVED" ? COLOR.statusDiffFg : COLOR.textMuted;
    return makeText(label, FONT_BOLD, 12, color);
  }
  function makeText(characters, font, size, color) {
    const text = figma.createText();
    text.fontName = font;
    text.fontSize = size;
    text.fills = [{ type: "SOLID", color }];
    text.characters = characters;
    return text;
  }

  // src/main/code.ts
  var UI_WIDTH = 400;
  var UI_HEIGHT = 560;
  figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });
  figma.ui.onmessage = async (message) => {
    switch (message.type) {
      case "ui-ready": {
        const token = await loadToken();
        figma.ui.postMessage({ type: "token-loaded", token });
        break;
      }
      case "save-token": {
        await saveToken(message.token);
        break;
      }
      case "clear-token": {
        await clearToken();
        break;
      }
      case "build-report": {
        try {
          const page = await buildReportPage(message.meta, message.rows);
          figma.ui.postMessage({ type: "report-done", pageName: page.name });
        } catch (error) {
          figma.ui.postMessage({
            type: "report-error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        break;
      }
    }
  };
})();
