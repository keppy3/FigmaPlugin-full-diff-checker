// Bundles the two plugin entry points with esbuild:
//   src/main/code.ts -> dist/code.js   (runs in Figma's sandboxed main thread)
//   src/ui/ui.ts      -> inlined into dist/ui.html (runs in the plugin's iframe UI)
//
// Figma requires the UI to be a single self-contained HTML file, so the UI
// bundle is generated in-memory and spliced into src/ui/ui.html at the
// "<!-- BUILD:SCRIPT -->" placeholder rather than written out as a separate .js file.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const distDir = path.join(__dirname, '..', 'dist');
const uiHtmlTemplate = path.join(__dirname, '..', 'src', 'ui', 'ui.html');
const uiHtmlOut = path.join(distDir, 'ui.html');
const SCRIPT_PLACEHOLDER = '<!-- BUILD:SCRIPT -->';

function writeUiHtml(bundledJs) {
  const template = fs.readFileSync(uiHtmlTemplate, 'utf8');
  if (!template.includes(SCRIPT_PLACEHOLDER)) {
    throw new Error(`src/ui/ui.html is missing the ${SCRIPT_PLACEHOLDER} placeholder`);
  }
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(uiHtmlOut, template.replace(SCRIPT_PLACEHOLDER, `<script>\n${bundledJs}\n</script>`));
  console.log('[build] dist/ui.html');
}

const inlineUiHtmlPlugin = {
  name: 'inline-ui-html',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      writeUiHtml(result.outputFiles[0].text);
    });
  },
};

async function run() {
  fs.mkdirSync(distDir, { recursive: true });

  const mainCtx = await esbuild.context({
    entryPoints: [path.join(__dirname, '..', 'src', 'main', 'code.ts')],
    bundle: true,
    outfile: path.join(distDir, 'code.js'),
    target: 'es2019',
    logLevel: 'info',
  });

  const uiCtx = await esbuild.context({
    entryPoints: [path.join(__dirname, '..', 'src', 'ui', 'ui.ts')],
    bundle: true,
    write: false,
    outfile: path.join(distDir, 'ui.js'),
    target: 'es2019',
    logLevel: 'info',
    plugins: [inlineUiHtmlPlugin],
  });

  await mainCtx.rebuild();
  await uiCtx.rebuild();

  if (isWatch) {
    await mainCtx.watch();
    await uiCtx.watch();
    console.log('[build] watching for changes...');
  } else {
    await mainCtx.dispose();
    await uiCtx.dispose();
    console.log('[build] done');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
