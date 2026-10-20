// ─── Trợ năng (accessibility) — cấu hình mặc định + tìm kiếm trong Cài đặt ───
// 6 khóa "tinh tế" mới: followSystem, underlineLinks, wideSpacing,
// readingRuler, preventFlashing, visualAlerts (xem applySettings để biết tác động).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, searchSettings, SETTINGS_SEARCH_INDEX, isReduceMotionEffective } from "./settingsStore.js";
import { setReadingRuler, isReadingRulerEnabled } from "./accessibility/readingRuler.js";

globalThis.__SGK_TEST__ = true;

const A11Y_KEYS = [
  "highContrast", "largerText", "reduceMotion", "focusIndicators",
  "followSystem", "underlineLinks", "wideSpacing", "readingRuler",
  "preventFlashing", "visualAlerts",
];

describe("Trợ năng — DEFAULT_SETTINGS.accessibility", () => {
  it("đủ 10 khóa, không thừa không thiếu", () => {
    assert.deepEqual(Object.keys(DEFAULT_SETTINGS.accessibility).sort(), [...A11Y_KEYS].sort());
  });

  it("mặc định: chỉ focusIndicators + followSystem bật, phần còn lại tắt", () => {
    const a = DEFAULT_SETTINGS.accessibility;
    assert.equal(a.focusIndicators, true);
    assert.equal(a.followSystem, true);
    for (const k of ["highContrast", "largerText", "reduceMotion", "underlineLinks", "wideSpacing", "readingRuler", "preventFlashing", "visualAlerts"]) {
      assert.equal(a[k], false, `${k} phải tắt theo mặc định`);
    }
  });

  it("mặc định là object — resetSection('accessibility') có gốc để khôi phục", () => {
    assert.ok(SETTINGS_SEARCH_INDEX.some((e) => e.section === "accessibility"));
    assert.equal(typeof DEFAULT_SETTINGS.accessibility, "object");
  });
});

describe("Trợ năng — SETTINGS_SEARCH_INDEX", () => {
  const hit = (q) => searchSettings(q).filter((r) => r.section === "accessibility");

  it("từ khoá chính mở đúng mục Trợ năng", () => {
    for (const q of ["trợ năng", "tương phản", "accessibility", "tiếp cận"]) {
      assert.ok(hit(q).length > 0, `query "${q}" phải trả về section accessibility`);
    }
  });

  it("từ khoá tính năng mới: thanh đọc, gạch chân, giãn chữ, chớp, hệ thống", () => {
    for (const q of ["thanh đọc", "gạch chân", "giãn chữ", "nhấp nháy", "prefers"]) {
      assert.ok(hit(q).length > 0, `query "${q}" phải trả về section accessibility`);
    }
  });

  it("anchor trỏ đúng card (sec-a11y hoặc sec-a11y-tools)", () => {
    const entries = SETTINGS_SEARCH_INDEX.filter((e) => e.section === "accessibility");
    assert.ok(entries.length >= 5, "ít nhất 5 entry cho accessibility");
    for (const e of entries) assert.match(e.anchor, /^sec-a11y(-tools)?$/);
  });

  it("query 'kiểm tra' không bị entry a11y đánh cắp (vẫn tới chẩn đoán)", () => {
    const r = searchSettings("kiểm tra");
    assert.ok(r.some((x) => x.section === "advanced"), "phải vẫn có section advanced");
    assert.ok(!r.some((x) => x.anchor === "sec-a11y-tools"), "a11y-tools chỉ match từ 'a11y/audit/quét'");
  });
});

describe("readingRuler — an toàn khi thiếu DOM (test Node)", () => {
  it("setReadingRuler bật/tắt không ném lỗi", () => {
    assert.doesNotThrow(() => setReadingRuler(true));
    assert.doesNotThrow(() => setReadingRuler(false));
    assert.equal(isReadingRulerEnabled(), false);
  });

  it("gọi lặp lại (idempotent) không ném", () => {
    assert.doesNotThrow(() => {
      setReadingRuler(true);
      setReadingRuler(true);
      setReadingRuler(false);
      setReadingRuler(false);
    });
  });
});

describe("isReduceMotionEffective — cổng âm thanh tôn trọng hệ thống", () => {
  it("mặc định trong Node (không matchMedia) → false", () => {
    assert.equal(isReduceMotionEffective(DEFAULT_SETTINGS), false);
    assert.equal(isReduceMotionEffective(null), false);
    assert.equal(isReduceMotionEffective({}), false);
  });

  it("bật tay → true bất kể followSystem", () => {
    assert.equal(isReduceMotionEffective({ accessibility: { reduceMotion: true, followSystem: false } }), true);
    assert.equal(isReduceMotionEffective({ accessibility: { reduceMotion: true } }), true);
  });

  it("followSystem=false + không bật tay → false (không đọc hệ thống)", () => {
    assert.equal(isReduceMotionEffective({ accessibility: { reduceMotion: false, followSystem: false } }), false);
  });
});
