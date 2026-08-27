// Tunable constants for the main-thread report builder. Kept in one place so
// future adjustments (spacing, colors, sizing) don't require hunting through
// buildReportPage.ts.

export const REPORT_PAGE_WIDTH = 1200;
export const ROW_GAP = 4;
export const ROW_PADDING_Y = 14;
export const STAGE_WIDTH = 160;
export const STAGE_HEIGHT = 104;

export const COLOR = {
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
  statusAddedFg: { r: 0.31, g: 0.275, b: 0.898 },
} as const;
