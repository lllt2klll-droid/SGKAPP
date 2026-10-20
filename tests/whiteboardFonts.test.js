// Whiteboard fonts: màn hình và file tải về dùng chung 1 font.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WB_FONTS,
  WB_DEFAULT_FONT_STACK,
  resolveWbFont,
  blankBoard,
  blankObject,
  normalizeBoard,
} from "../src/whiteboard/whiteboardStore.js";
import {
  effectiveBoardFont,
  fontFamilyOf,
  docxFontOf,
  boardDocxFont,
} from "../src/whiteboard/whiteboardFonts.js";

describe("whiteboard fonts", () => {
  it("resolveWbFont: object > board > mặc định", () => {
    assert.equal(resolveWbFont({ fontFamily: "Arial" }, "Be"), "Arial");
    assert.equal(resolveWbFont({ fontFamily: "" }, "Be"), "Be");
    assert.equal(resolveWbFont({ fontFamily: "" }, ""), WB_DEFAULT_FONT_STACK);
    assert.equal(resolveWbFont("", ""), WB_DEFAULT_FONT_STACK);
  });

  it("blank board/object có trường font", () => {
    const b = blankBoard("T");
    assert.ok("defaultFontFamily" in b);
    const o = blankObject("node");
    assert.ok("fontFamily" in o);
  });

  it("normalizeBoard giữ fontFamily + defaultFontFamily", () => {
    const stack = WB_FONTS.find((f) => f.id === "bevn").value;
    const b = normalizeBoard({
      name: "T",
      defaultFontFamily: stack,
      objects: [{ ...blankObject("node"), fontFamily: stack, text: "hi" }],
      connectors: [],
    });
    assert.equal(b.defaultFontFamily, stack);
    assert.equal(b.objects[0].fontFamily, stack);
  });

  it("effectiveBoardFont: board > máy > mặc định", () => {
    assert.equal(effectiveBoardFont({ defaultFontFamily: "B" }), "B");
    // Node không có localStorage WB font → về mặc định
    assert.equal(effectiveBoardFont(null), WB_DEFAULT_FONT_STACK);
  });

  it("fontFamilyOf + docx mapping khớp màn hình", () => {
    const beStack = WB_FONTS.find((f) => f.id === "bevn").value;
    const board = { defaultFontFamily: beStack };
    assert.equal(fontFamilyOf({ fontFamily: "" }, board), beStack);
    assert.equal(fontFamilyOf({ fontFamily: "Arial" }, board), "Arial");
    assert.equal(docxFontOf({ fontFamily: "" }, board), "Be Vietnam Pro");
    assert.equal(boardDocxFont(board), "Be Vietnam Pro");
    // stack lạ → lấy family đầu tiên, không crash
    assert.equal(docxFontOf({ fontFamily: "My Font, sans-serif" }, null), "My Font");
  });
});
