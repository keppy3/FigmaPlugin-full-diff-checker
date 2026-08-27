// Entry point for the plugin's sandboxed main thread. Kept intentionally
// thin: it only routes messages from the UI to the token-storage and
// report-building modules, which is where the real logic lives.
import type { UiToMainMessage } from '../shared/messages';
import { loadToken, saveToken, clearToken } from './storage';
import { buildReportPage } from './report/buildReportPage';

const UI_WIDTH = 400;
const UI_HEIGHT = 560;

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT, themeColors: true });

figma.ui.onmessage = async (message: UiToMainMessage) => {
  switch (message.type) {
    case 'ui-ready': {
      const token = await loadToken();
      figma.ui.postMessage({ type: 'token-loaded', token });
      break;
    }

    case 'save-token': {
      await saveToken(message.token);
      break;
    }

    case 'clear-token': {
      await clearToken();
      break;
    }

    case 'build-report': {
      try {
        const page = await buildReportPage(message.meta, message.rows);
        figma.ui.postMessage({ type: 'report-done', pageName: page.name });
      } catch (error) {
        figma.ui.postMessage({
          type: 'report-error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }
  }
};
