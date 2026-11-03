import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS } from "./services/settingsStore.js";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));

test("appearance defaults to the smallest font and most compact density", () => {
  assert.equal(DEFAULT_SETTINGS.appearance.fontSize, "small");
  assert.equal(DEFAULT_SETTINGS.appearance.density, "compact");
  assert.equal(DEFAULT_SETTINGS.accessibility.largerText, false);
  assert.equal(DEFAULT_SETTINGS.accessibility.wideSpacing, false);
});

test("editor defaults to its smallest font size and line spacing", () => {
  assert.equal(DEFAULT_SETTINGS.editor.defaultFontSize, "12px");
  assert.equal(DEFAULT_SETTINGS.editor.defaultLineHeight, "1.0");
});

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(css|jsx)$/.test(entry.name) ? [file] : [];
  });
}

test("UI font sizes use the root scale controlled by appearance settings", () => {
  const fixedPixelFont = /(?<![\w-])font-size\s*:\s*[-+]?(?:\d*\.)?\d+px\b/i;
  const inlinePixelFont = /\bfontSize\s*:\s*["']?\d+(?:\.\d+)?(?:px)?["']?(?![\w.%])/;
  const violations = [];

  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    if (fixedPixelFont.test(source)) violations.push(`${file}: fixed px font-size`);
    if (!file.endsWith(".jsx")) continue;
    for (const style of source.matchAll(/style=\{\{[\s\S]*?\}\}/g)) {
      if (inlinePixelFont.test(style[0])) violations.push(`${file}: fixed inline fontSize`);
    }
  }

  assert.deepEqual(violations, []);
});
