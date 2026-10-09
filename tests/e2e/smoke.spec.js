import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.E2E_PORT || 5321);
const BASE = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let browser = null;

async function healthy(url) {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function waitHealthy(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await healthy(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

before(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/index.html khong ton tai — hãy chạy `npm run build` trước khi chạy e2e.");
  }
  if (!(await healthy(BASE))) {
    serverProcess = spawn(process.execPath, ["--no-warnings", "server.js"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
    });
    if (!(await waitHealthy(BASE, 20000))) {
      throw new Error(`Khong khoi duoc server e2e tren ${BASE}`);
    }
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
});

test("app load duoc, khong co pageerror", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    assert.equal(await page.locator(".app-shell").count(), 1, "phai render duoc .app-shell");
    assert.deepEqual(errors, [], `khong duoc co pageerror: ${errors.join(" | ")}`);
  } finally {
    await page.close();
  }
});

test("chuyen den Thu vien sach thay duoc toolbar hien thi/sap xep", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("aside button")].find((b) =>
        (b.getAttribute("aria-label") || "").includes("Thu vien sach") ||
        (b.getAttribute("aria-label") || "").includes("Thư viện sách"),
      );
      if (btn) btn.click();
    });
    await page.waitForTimeout(2500);
    assert.equal(await page.locator(".libx-seg button").count(), 2, "toolbar chuyen kieu hien thi thieu nut");
    assert.equal(await page.locator(".sort-select").count(), 1, "thieu o sap xep");
  } finally {
    await page.close();
  }
});

test("Ctrl+K mo dung 1 lop GlobalSearch", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(700);
    const n = await page.locator(".global-search-overlay").count();
    assert.equal(n, 1, `mong doi 1 overlay, thay ${n}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".global-search-overlay").count(), 0, "Escape phai dong overlay");
  } finally {
    await page.close();
  }
});

test("dang doc sach: Ctrl+K mo GlobalSearch, khong mo trung command palette cua reader", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    // Vao Thu vien sach
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("aside button")].find((b) =>
        (b.getAttribute("aria-label") || "").includes("Thư viện sách"),
      );
      if (btn) btn.click();
    });
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
    // Mo quyen sach dau tien -> reader
    await page.locator(".libx-book, .libx-row").first().click();
    await page.waitForSelector(".reader-root", { timeout: 30000 });

    // Ctrl+K = GlobalSearch, rieng
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(700);
    assert.equal(await page.locator(".global-search-overlay").count(), 1, "Ctrl+K phai mo GlobalSearch khi dang doc sach");
    assert.equal(await page.locator(".command-palette").count(), 0, "Ctrl+K khong duoc mo command palette cua reader (mo 2 lop)");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".global-search-overlay").count(), 0, "Escape phai dong GlobalSearch");

    // Command palette cua reader co phim rieng Alt+K
    await page.keyboard.press("Alt+k");
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".command-palette").count(), 1, "Alt+K phai mo command palette cua reader");
    assert.equal(await page.locator(".global-search-overlay").count(), 0, "Alt+K khong duoc mo GlobalSearch");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".command-palette").count(), 0, "Escape phai dong command palette cua reader");
  } finally {
    await page.close();
  }
});

test("Ctrl+K: Enter chay dung item dang highlight khi nhieu nhom ket qua", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    // Seed 2 nhom cung mot tu khoa: idea (day TRUOC vao results) + vocab (day SAU).
    // Thu tu hien thi lai dao nguoc (vocab truoc idea theo TYPE_ORDER) — day chinh la
    // tinh huong khien index keyboard tro sang ket qua khac item dang highlight.
    const KEY = "SGKTIMKIEMTEST";
    await page.addInitScript((k) => {
      localStorage.setItem("sgk_ideas", JSON.stringify([{ id: "idea-e2e-1", title: k, description: "" }]));
      localStorage.setItem(
        "sgk_vocab",
        JSON.stringify([{ id: "vocab-e2e-1", word: k, meaning: "nghĩa test", bookTitle: "SGK test" }]),
      );
    }, KEY);

    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
    await page.keyboard.type(KEY);
    await page.waitForTimeout(700);

    // Hien thi: Từ vựng phai đứng TRUOC Ý tưởng
    const labels = await page.locator(".global-search-group-label").allTextContents();
    assert.deepEqual(labels, ["Từ vựng", "Ý tưởng"], `thu tu nhom hien thi sai: ${JSON.stringify(labels)}`);

    // Item duoc highlight (index 0) phai thuoc nhom Từ vựng
    const selectedText = await page.locator(".global-search-result.selected").first().textContent();
    assert.ok(selectedText && selectedText.includes(KEY), `item highlight phai chua tu khoa, thay: ${selectedText}`);

    // Enter phai mo dung item do (Từ vựng) — khong phai ket qua Index #0 (Ý tưởng)
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    assert.equal(await page.locator(".ideas-view").count(), 0, "Enter khong duoc mo Ý tưởng (ket qua Index #0 cua mang results cu)");
    assert.ok(
      (await page.locator(".vocab-view").count()) >= 1,
      "Enter phai mo Từ vựng (item dang highlight)",
    );
  } finally {
    await page.close();
  }
});

test("Ctrl+K phan quyen: TextBookModal dang mo so huu Ctrl+K (chen link), khong mo GlobalSearch", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const dialogs = [];
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("sgk:open-word-editor")));
    await page.waitForSelector(".word-modal-overlay", { timeout: 10000 });

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(700);

    assert.equal(
      await page.locator(".global-search-overlay").count(),
      0,
      "Ctrl+K khi TextBookModal dang mo khong duoc mo GlobalSearch cung luc",
    );
    assert.ok((await page.locator(".word-modal-overlay").count()) >= 1, "modal van con mo");
    assert.ok(dialogs.length >= 1, "Ctrl+K van phai chen link duoc trong modal (prompt chen URL)");
  } finally {
    await page.close();
  }
});

test("Escape tu GlobalSearch khong noi event len reader: bang lenh reader van con", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("aside button")].find((b) =>
        (b.getAttribute("aria-label") || "").includes("Thư viện sách"),
      );
      if (btn) btn.click();
    });
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
    await page.locator(".libx-book, .libx-row").first().click();
    await page.waitForSelector(".reader-root", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Mo bang lenh reader (Alt+K), sau do mo GlobalSearch (Ctrl+K) len tren
    await page.keyboard.press("Alt+k");
    await page.waitForTimeout(400);
    assert.ok((await page.locator(".command-palette").count()) >= 1, "bang lenh reader chua mo duoc");
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
    assert.ok((await page.locator(".global-search-overlay").count()) >= 1, "GlobalSearch chua mo duoc");

    // Escape chi dong GlobalSearch — khong duoc noi len tat bang lenh reader
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    assert.equal(await page.locator(".global-search-overlay").count(), 0, "Escape khong dong GlobalSearch");
    assert.ok(
      (await page.locator(".command-palette").count()) >= 1,
      "Escape dang noi event len reader (tat bang lenh reader) — phai bi chan trong GlobalSearch",
    );
    assert.ok((await page.locator(".reader-root").count()) >= 1, "reader van con mo");
  } finally {
    await page.close();
  }
});

test("Xoa query reset selectedIndex: Enter tren danh sach recent dung item dang highlight", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const KEY = "SGKRESETIDX";
    const RECENT = ["recentA", "recentB", "recentC", "recentD"];
    await page.addInitScript(
      ({ k, recent }) => {
        localStorage.setItem("sgk_recent_searches", JSON.stringify(recent));
        localStorage.setItem("sgk_ideas", JSON.stringify([{ id: "idea-ri-1", title: k, description: "" }]));
        localStorage.setItem(
          "sgk_vocab",
          JSON.stringify([{ id: "vocab-ri-1", word: k, meaning: "nghĩa test", bookTitle: "SGK test" }]),
        );
      },
      { k: KEY, recent: RECENT },
    );
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
    // Gõ query co ket qua → ArrowDown xuong index 1
    await page.keyboard.type(KEY);
    await page.waitForTimeout(700);
    assert.equal(
      (await page.locator(".global-search-result").count()) >= 2,
      true,
      "can >= 2 ket qua de di chuyen index",
    );
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const selIdx = await page.evaluate(() =>
      [...document.querySelectorAll(".global-search-result")].findIndex((e) => e.classList.contains("selected")),
    );
    assert.equal(selIdx, 1, `ArrowDown phai dua highlight xuong item #1 — thay ${selIdx}`);

    // Xoá hết query → quay lai danh sach recent, selectedIndex PHAI ve 0
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.querySelector(".global-search-input").value), "", "query chua duoc xoa het");

    // Enter chon item dang highlight = recent[0]
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    const val = await page.evaluate(() => document.querySelector(".global-search-input").value);
    assert.equal(
      val,
      RECENT[0],
      `Enter phai ap dung recent[0] (item highlight) — thay "${val}" (selectedIndex cu khong duoc reset)`,
    );
  } finally {
    await page.close();
  }
});

test("Ctrl+K ton trong Cài đặt tìm kiếm: caseSensitive=true khong khop chuoi thuong", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const TITLE = "SGKCaseTEST";
    await page.addInitScript((t) => {
      localStorage.setItem(
        "sgk_settings",
        JSON.stringify({ search: { caseSensitive: true, wholeWord: false, fuzzyMatch: true } }),
      );
      localStorage.setItem("sgk_ideas", JSON.stringify([{ id: "idea-case-1", title: t, description: "" }]));
    }, TITLE);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);

    // Goi dung chuoi thuong → caseSensitive=true → khong duoc khop
    await page.keyboard.type("sgkcasetest");
    await page.waitForTimeout(700);
    assert.equal(
      await page.locator(".global-search-result").count(),
      0,
      "caseSensitive=true: chuoi thuong khong duoc khop chuoi hoa (truoc day Ctrl+K luon khop)",
    );

    // Goi dung chuoi → phai khop
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(TITLE);
    await page.waitForTimeout(700);
    const n = await page.locator(".global-search-result").count();
    assert.ok(n >= 1, `chuoi dung case phai khop — thay ${n} ket qua`);
  } finally {
    await page.close();
  }
});

test("Hint Ctrl+K/Escape lay tu Settings — doi shortcut thi hint tu cap nhat", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    // Đổi combo trong Settings: palette → Ctrl+Shift+P, close → Shift+Escape
    await page.addInitScript(() => {
      localStorage.setItem(
        "sgk_settings",
        JSON.stringify({
          keyboard: {
            shortcuts: {
              "global.commandPalette": "Ctrl+Shift+P",
              "global.close": "Shift+Escape",
            },
          },
        }),
      );
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });

    // Ctrl+K không còn là combo → mở qua event để xem hint
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    const openedByCtrlK = await page.locator(".global-search-overlay").count();
    if (!openedByCtrlK) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("sgk:open-global-search")));
      await page.waitForTimeout(400);
    }
    assert.ok((await page.locator(".global-search-overlay").count()) >= 1, "GlobalSearch phai mo duoc");

    const text = await page.locator(".global-search-modal").textContent();
    assert.ok(
      text.includes("Ctrl + Shift + P"),
      `hint phai hien combo tu Settings (Ctrl + Shift + P) — text: ${text.slice(0, 200)}`,
    );
    assert.ok(text.includes("Shift + Escape"), `hint dong phai hien Shift+Escape (tu Settings) — text: ${text.slice(0, 200)}`);
    assert.ok(!text.includes("Ctrl + K"), "khong duoc con hardcode Ctrl + K trong hint");
  } finally {
    await page.close();
  }
});

test("Lock scroll body khi mo GlobalSearch, khoi phuc khi dong", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    const before = await page.evaluate(() => document.body.style.overflow);
    assert.notEqual(before, "hidden", "truoc khi mo, body khong bi khoa scroll");

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
      "mo GlobalSearch phai khoa scroll body",
    );

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      before,
      "dong GlobalSearch phai khoi phuc overflow cu",
    );
  } finally {
    await page.close();
  }
});

test("↑↓ cuon item highlight vao viewport (scrollIntoView)", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const KEY = "SGKSCROLLVOCAB";
    await page.addInitScript((k) => {
      const vocab = Array.from({ length: 12 }, (_, i) => ({
        id: `vocab-scroll-${i}`,
        word: `${k} ${i}`,
        meaning: `nghĩa ${i}`,
        bookTitle: "SGK test",
      }));
      localStorage.setItem("sgk_vocab", JSON.stringify(vocab));
    }, KEY);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);
    await page.keyboard.type(KEY);
    await page.waitForTimeout(700);
    assert.equal(await page.locator(".global-search-result").count(), 12, "can du 12 ket qua de vuot khung nhin");

    // Di xuong 10 lan — body chi cao 400px, item thu 11 khoang ~560px phai duoc cuon vao
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);

    const inView = await page.evaluate(() => {
      const el = document.querySelector(".global-search-result.selected");
      const body = document.querySelector(".global-search-body");
      if (!el || !body) return { ok: false, reason: "thieu element selected/body" };
      const r = el.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      return {
        ok: r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        bodyTop: Math.round(b.top),
        bodyBottom: Math.round(b.bottom),
      };
    });
    assert.equal(
      inView.ok,
      true,
      `item highlight phai nam trong khung body (scrollIntoView) — thay ${JSON.stringify(inView)}`,
    );
  } finally {
    await page.close();
  }
});

test("a11y GlobalSearch: dialog/combobox/listbox, aria-activedescendant, focus trap", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const KEY = "SGKA11YTEST";
    await page.addInitScript((k) => {
      localStorage.setItem("sgk_ideas", JSON.stringify([{ id: "idea-a11y-1", title: k, description: "" }]));
    }, KEY);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);

    // Dialog + combobox
    const base = await page.evaluate(() => {
      const modal = document.querySelector(".global-search-modal");
      const input = document.querySelector(".global-search-input");
      return {
        modalRole: modal?.getAttribute("role"),
        ariaModal: modal?.getAttribute("aria-modal"),
        label: modal?.getAttribute("aria-label"),
        inputRole: input?.getAttribute("role"),
        controls: input?.getAttribute("aria-controls"),
        expanded: input?.getAttribute("aria-expanded"),
        focusInInput: document.activeElement === input,
      };
    });
    assert.equal(base.modalRole, "dialog", "modal phai role=dialog");
    assert.equal(base.ariaModal, "true", "modal phai aria-modal=true");
    assert.ok(base.label, "modal phai co aria-label");
    assert.equal(base.inputRole, "combobox", "input phai role=combobox");
    assert.equal(base.controls, "global-search-listbox", "input phai aria-controls listbox");
    assert.equal(base.expanded, "true", "combobox aria-expanded=true");
    assert.equal(base.focusInInput, true, "focus phai vao input khi mo");

    // Gõ co ket qua → aria-activedescendant tro toi option dang highlight
    await page.keyboard.type(KEY);
    await page.waitForTimeout(700);
    const opt = await page.evaluate(() => {
      const input = document.querySelector(".global-search-input");
      const id = input?.getAttribute("aria-activedescendant");
      const el = id ? document.getElementById(id) : null;
      return {
        id,
        exists: !!el,
        role: el?.getAttribute("role"),
        selected: el?.getAttribute("aria-selected"),
        listbox: !!document.getElementById("global-search-listbox"),
        listRole: document.getElementById("global-search-listbox")?.getAttribute("role"),
      };
    });
    assert.ok(opt.id, "input phai co aria-activedescendant khi co ket qua");
    assert.equal(opt.exists, true, `aria-activedescendant "${opt.id}" phai tro toi element ton tai`);
    assert.equal(opt.role, "option", "element duoc tro phai role=option");
    assert.equal(opt.selected, "true", "option duoc tro phai aria-selected=true");
    assert.equal(opt.listbox, true, "phai co listbox id=global-search-listbox");
    assert.equal(opt.listRole, "listbox", "listbox role= listbox");

    // Focus trap: Tab/Shift+Tab nhieu lan van nam trong modal
    for (let i = 0; i < 15; i++) await page.keyboard.press("Tab");
    let inside = await page.evaluate(() => document.querySelector(".global-search-modal").contains(document.activeElement));
    assert.equal(inside, true, "Tab 15 lan phai van nam trong modal (focus trap)");
    for (let i = 0; i < 20; i++) await page.keyboard.press("Shift+Tab");
    inside = await page.evaluate(() => document.querySelector(".global-search-modal").contains(document.activeElement));
    assert.equal(inside, true, "Shift+Tab 20 lan phai van nam trong modal (focus trap)");
  } finally {
    await page.close();
  }
});

test("Ctrl+K debounce quet localStorage va khong quet lai khi App re-render", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    // Đếm số lần quét của effect GlobalSearch (read qua safeStorage) — bắt lỗi:
    // mỗi ký tự quét 1 lần (không debounce) và App re-render (onNavigate inline)
    // kích hoạt effect quét lại. Đo theo WINDOW thời gian để loại nguồn đọc
    // sgk_vocab khác (Dashboard/service) xảy ra rải rác.
    await page.addInitScript(() => {
      window.__readTimes = [];
      const orig = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) {
        try {
          const st = new Error().stack || "";
          if (k === "sgk_vocab" && st.includes("safeStorage")) {
            window.__readTimes.push(Date.now());
          }
        } catch {}
        return orig.call(this, k);
      };
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    // Chờ app boot settle (fetchBooks xong) — nếu không, books đổi giữa chừng sẽ
    // hợp lệ kích hoạt effect lần 2, nhiễu số liệu đo debounce.
    await page.waitForTimeout(2000);

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(400);

    // Bắn 13 event input LIÊN TỤC đồng bộ (không roundtrip từng phím) → debounce
    // gộp còn 1 lần quét. keyboard.type từng phím quá chậm (gap >200ms giữa phím).
    await page.evaluate(() => {
      window.__readTimes = [];
      window.__t0 = Date.now();
      const input = document.querySelector(".global-search-input");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      for (const ch of "SGKDEBOUNCEXX") {
        setter.call(input, (input.value || "") + ch);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(600);
    // Quét debounce phải nằm trong [t0+150, t0+500] — đúng 1 lần
    const readsInWindow = await page.evaluate(() => {
      const { __t0: t0, __readTimes: times } = window;
      return (times || []).filter((t) => t >= t0 + 150 && t <= t0 + 500).length;
    });
    assert.equal(
      readsInWindow,
      1,
      `13 ky tu giong lien tuc phai chi quet 1 lan trong cua so debounce — thay ${readsInWindow} lan`,
    );

    // Gây App re-render (mở modal soạn sách) — query khong doi → khong duoc quet lai
    await page.evaluate(() => {
      window.__readTimes = [];
      window.__t1 = Date.now();
      window.dispatchEvent(new CustomEvent("sgk:open-word-editor"));
    });
    await page.waitForTimeout(700);
    const readsRerender = await page.evaluate(() => {
      const { __t1: t1, __readTimes: times } = window;
      return (times || []).filter((t) => t >= t1 && t <= t1 + 650).length;
    });
    assert.equal(
      readsRerender,
      0,
      `App re-render khong duoc kich hoat effect quet lai (onNavigate inline) — thay ${readsRerender} lan`,
    );
  } finally {
    await page.close();
  }
});

test("GlobalSearch dung token z-index --z-search-overlay, khong so cung", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);

    const info = await page.evaluate(() => {
      const el = document.querySelector(".global-search-overlay");
      const computed = el ? getComputedStyle(el).zIndex : "(khong co overlay)";
      let declared = "";
      try {
        for (const sheet of document.styleSheets) {
          try {
            for (const r of sheet.cssRules) {
              if (r.selectorText && r.selectorText.includes(".global-search-overlay") && r.style && r.style.zIndex) {
                declared = r.style.zIndex;
              }
            }
          } catch {}
        }
      } catch {}
      const token = getComputedStyle(document.documentElement).getPropertyValue("--z-search-overlay").trim();
      return { computed, declared, token };
    });

    assert.ok(info.token, "token --z-search-overlay phai ton tai trong 00-tokens.css");
    assert.ok(
      String(info.declared).includes("var(--z-search-overlay)"),
      `rule .global-search-overlay phai dung token — thay: "${info.declared}"`,
    );
    assert.equal(info.computed, info.token, "z-index tinh toan phai la gia tri token");
  } finally {
    await page.close();
  }
});

test("dang doc sach: 2 lop cung mo — Enter/↑↓ thuoc GlobalSearch, khong chay lenh reader an", async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-shell", { timeout: 20000 });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("aside button")].find((b) =>
        (b.getAttribute("aria-label") || "").includes("Thư viện sách"),
      );
      if (btn) btn.click();
    });
    await page.waitForSelector(".libx-book, .libx-row", { timeout: 20000 });
    await page.locator(".libx-book, .libx-row").first().click();
    await page.waitForSelector(".reader-root", { timeout: 30000 });

    // 1) Bang lenh reader co phim rieng Alt+K — van dieu huong duoc khi focus trong do
    await page.keyboard.press("Alt+k");
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".command-palette").count(), 1, "Alt+K phai mo command palette");
    const firstCmd = await page.locator(".command-palette-item.selected .command-palette-item-label").first().textContent();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const secondCmd = await page.locator(".command-palette-item.selected .command-palette-item-label").first().textContent();
    assert.notEqual(secondCmd, firstCmd, "↑↓ phai van dieu huong duoc trong bang lenh reader");

    // 2) Ctrl+K mo GlobalSearch khi bang lenh reader dang mo (2 lop cung ton tai)
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(600);
    assert.equal(await page.locator(".global-search-overlay").count(), 1, "Ctrl+K phai mo GlobalSearch");
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains("global-search-input")),
      true,
      "focus phai chuyen vao o tim kiem GlobalSearch",
    );

    // 3) Go tu khoa khong co ket qua + Enter: GlobalSearch xu ly (luu recent),
    //    reader khong duoc cuop Enter (lenh mac dinh "Di den trang..." se autoFocus o nhap trang)
    await page.keyboard.type("zzzkhongcokq");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains("global-search-input")),
      true,
      "Enter khong duoc bang lenh reader cuop (focus van o tim kiem)",
    );
    assert.equal(await page.locator(".global-search-overlay").count(), 1, "GlobalSearch van mo (khong co kq → chi luu recent)");
    // Bang lenh reader van con o day — neu reader cuop Enter, executeCommand se dong no
    assert.equal(
      await page.locator(".command-palette").count(),
      1,
      "Enter khong duoc bang lenh reader cuop (khong executeCommand → khong dong bang lenh)",
    );

    // 4) Escape dong lop tren cung (GlobalSearch) — khong noi event dong luon bang lenh reader.
    //    Escape lan 2 (search da dong) moi den duoc bang lenh reader.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".global-search-overlay").count(), 0, "Escape dong GlobalSearch");
    assert.equal(
      await page.locator(".command-palette").count(),
      1,
      "Escape phai dung o GlobalSearch — khong noi event dong luon bang lenh reader",
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".command-palette").count(), 0, "Escape lan 2 (search da dong) dong bang lenh reader");
  } finally {
    await page.close();
  }
});
