// ─── Test matchesShortcut — Cmd (macOS) phải thay Ctrl đúng chỗ ─────────────
// Lỗi #8: hasCtrl đã nuốt metaKey nhưng check needMeta!==hasMeta vẫn chặn
// → "Ctrl+K" không bao giờ khớp Cmd+K trên macOS.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesShortcut, DEFAULT_SHORTCUTS, SHORTCUT_META, getShortcuts, getShortcut, comboToString, splitCombo } from "./keyboardShortcuts.js";

globalThis.__SGK_TEST__ = true;

const ev = (key, mods = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("keyboardShortcuts — matchesShortcut", () => {
  it("Cmd+K (macOS) khớp combo Ctrl+K", () => {
    assert.equal(matchesShortcut(ev("k", { metaKey: true }), "Ctrl+K"), true);
    assert.equal(matchesShortcut(ev("K", { metaKey: true }), "Ctrl+K"), true);
  });

  it("Ctrl+K (Windows/Linux) vẫn khớp Ctrl+K", () => {
    assert.equal(matchesShortcut(ev("k", { ctrlKey: true }), "Ctrl+K"), true);
  });

  it("Cmd+KHÔNG khớp các combo khác Ctrl", () => {
    assert.equal(matchesShortcut(ev("k", { metaKey: true }), "Alt+K"), false);
    assert.equal(matchesShortcut(ev("k", { metaKey: true }), "Escape"), false);
    assert.equal(matchesShortcut(ev("k", { ctrlKey: true }), "Alt+K"), false);
  });

  it("phím trần không khớp khi có Ctrl/Cmd ghi đè", () => {
    assert.equal(matchesShortcut(ev("s"), "S"), true, "S trần khớp S");
    assert.equal(matchesShortcut(ev("s", { ctrlKey: true }), "S"), false);
    assert.equal(matchesShortcut(ev("s", { metaKey: true }), "S"), false, "Cmd+S không được khớp combo chữ trần");
  });

  it("combo Meta+K chỉ khớp Cmd, không khớp Ctrl trần", () => {
    assert.equal(matchesShortcut(ev("k", { metaKey: true }), "Meta+K"), true);
    assert.equal(matchesShortcut(ev("k", { ctrlKey: true }), "Meta+K"), false);
  });

  it("Alt+K (bảng lệnh reader) khớp cả Option+K", () => {
    assert.equal(matchesShortcut(ev("k", { altKey: true }), "Alt+K"), true);
    assert.equal(matchesShortcut(ev("k", { altKey: true, metaKey: true }), "Alt+K"), false, "Cmd+Option+K ≠ Alt+K (Ctrl rảnh nhưng cần Alt)");
  });

  it("Shift phải khớp đúng (Ctrl+Shift+S)", () => {
    assert.equal(matchesShortcut(ev("s", { ctrlKey: true, shiftKey: true }), "Ctrl+Shift+S"), true);
    assert.equal(matchesShortcut(ev("s", { ctrlKey: true }), "Ctrl+Shift+S"), false);
    assert.equal(matchesShortcut(ev("S", { ctrlKey: true, shiftKey: true }), "Ctrl+Shift+Z"), false, "key khác thì vẫn false");
  });

  it("Escape khớp phím Escape trần", () => {
    assert.equal(matchesShortcut(ev("Escape"), "Escape"), true);
    assert.equal(matchesShortcut(ev("Escape", { ctrlKey: true }), "Escape"), false);
  });

  it("mọi combo mặc định đều khớp chính nó (event giả đúng modifier)", () => {
    for (const combo of Object.values(DEFAULT_SHORTCUTS)) {
      const parts = combo.split("+");
      const main = parts[parts.length - 1];
      const e = ev(main, {
        ctrlKey: parts.includes("Ctrl"),
        altKey: parts.includes("Alt"),
        shiftKey: parts.includes("Shift"),
        metaKey: parts.includes("Meta"),
      });
      assert.equal(matchesShortcut(e, combo), true, `combo mặc định phải khớp chính nó: ${combo}`);
    }
  });
});

// ─── Lỗi #14 — nhãn shortcut phải đúng nghĩa sau khi tách Alt+K cho reader ───
describe("keyboardShortcuts — SHORTCUT_META đúng nghĩa", () => {
  it("global.commandPalette = tìm kiếm toàn cục (không còn ghi 'bảng lệnh')", () => {
    const meta = SHORTCUT_META["global.commandPalette"];
    assert.equal(meta.label, "Tìm kiếm toàn cục");
    assert.ok(!/bảng lệnh/i.test(meta.desc), `desc không được nói bảng lệnh: ${meta.desc}`);
    assert.equal(DEFAULT_SHORTCUTS["global.commandPalette"], "Ctrl+K");
  });

  it("reader.commandPalette mô tả đúng phím riêng Alt+K, không nhập nhằng Ctrl+K", () => {
    const meta = SHORTCUT_META["reader.commandPalette"];
    assert.equal(DEFAULT_SHORTCUTS["reader.commandPalette"], "Alt+K");
    assert.ok(meta.desc.includes("Alt+K"), `desc phải nêu Alt+K: ${meta.desc}`);
    assert.ok(!/^Mở bảng lệnh của Reader \(riêng Ctrl\+K/.test(meta.desc), "không được nói Ctrl+K là bảng lệnh");
  });

  it("mọi entry SHORTCUT_META có label/cat/desc khác rỗng", () => {
    for (const [id, m] of Object.entries(SHORTCUT_META)) {
      assert.ok(m.label && m.label.trim(), `${id} thiếu label`);
      assert.ok(m.cat && m.cat.trim(), `${id} thiếu cat`);
      assert.ok(m.desc && m.desc.trim(), `${id} thiếu desc`);
    }
  });
});

// ─── Lỗi #17 — coverage: getShortcuts/getShortcut/comboToString/splitCombo ──
describe("keyboardShortcuts — getShortcuts / getShortcut", () => {
  const withLS = (store, fn) => {
    const prev = globalThis.localStorage;
    if (store === undefined) {
      delete globalThis.localStorage;
    } else {
      const mem = { ...store };
      globalThis.localStorage = {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
        key: (i) => Object.keys(mem)[i] ?? null,
        get length() { return Object.keys(mem).length; },
      };
    }
    try { return fn(); } finally {
      if (prev === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = prev;
    }
  };

  it("không có localStorage → trả về combo mặc định, không ném", () => {
    withLS(undefined, () => {
      assert.equal(getShortcut("global.commandPalette"), "Ctrl+K");
      assert.deepEqual(getShortcuts(), { ...DEFAULT_SHORTCUTS });
    });
  });

  it("user đổi shortcut trong Settings → getShortcut trả combo mới (nền tảng hint #13)", () => {
    withLS(
      { sgk_settings: JSON.stringify({ keyboard: { shortcuts: { "global.commandPalette": "Ctrl+Shift+P", "global.close": "Shift+Escape" } } }) },
      () => {
        assert.equal(getShortcut("global.commandPalette"), "Ctrl+Shift+P");
        assert.equal(getShortcut("global.close"), "Shift+Escape");
        assert.equal(getShortcut("nav.library"), DEFAULT_SHORTCUTS["nav.library"], "id chưa đổi vẫn giữ mặc định");
      },
    );
  });

  it("settings rỗng / sai kiểu → fallback DEFAULT_SHORTCUTS", () => {
    withLS({ sgk_settings: JSON.stringify({ keyboard: { shortcuts: {} } }) }, () => {
      assert.equal(getShortcut("global.commandPalette"), "Ctrl+K");
    });
    withLS({ sgk_settings: "not-json{{" }, () => {
      assert.equal(getShortcut("global.commandPalette"), "Ctrl+K");
    });
    withLS({ sgk_settings: JSON.stringify({ keyboard: { shortcuts: "chuỗi sai kiểu" } }) }, () => {
      assert.equal(getShortcut("global.commandPalette"), "Ctrl+K");
    });
  });

  it("id không tồn tại → chuỗi rỗng", () => {
    assert.equal(getShortcut("khong.ton.tai"), "");
  });
});

describe("keyboardShortcuts — splitCombo (hint #13) & comboToString", () => {
  it("splitCombo tách từng phím, bỏ rỗng", () => {
    assert.deepEqual(splitCombo("Ctrl+Shift+K"), ["Ctrl", "Shift", "K"]);
    assert.deepEqual(splitCombo("Ctrl + K"), ["Ctrl", "K"]);
    assert.deepEqual(splitCombo("Escape"), ["Escape"]);
    assert.deepEqual(splitCombo(""), []);
    assert.deepEqual(splitCombo(null), []);
    assert.deepEqual(splitCombo(undefined), []);
  });

  it("comboToString ghép modifier + key chuẩn hóa", () => {
    assert.equal(comboToString({ key: "k", ctrlKey: true }), "Ctrl+K");
    assert.equal(comboToString({ key: "k", metaKey: true }), "Ctrl+K");
    assert.equal(comboToString({ key: "k", altKey: true, shiftKey: true }), "Alt+Shift+K");
    assert.equal(comboToString({ key: "Escape" }), "Escape");
    assert.equal(comboToString({ key: " " }), "Space");
    assert.equal(comboToString({ key: "a" }), "A", "chữ thường → hoa");
  });

  it("comboToString không push phím modifier vào phần key (chỉ còn chuỗi modifier)", () => {
    assert.equal(comboToString({ key: "Shift", shiftKey: true }), "Shift");
    assert.equal(comboToString({ key: "Control", ctrlKey: true }), "Ctrl");
    assert.equal(comboToString({ key: "Alt", altKey: true }), "Alt");
  });
});
