// ─── Cài đặt điều khiển toàn app: Bảng điều khiển (dashboard) + Tính năng (features) ───
// Guard 2 nhóm helper mới của settingsStore + hiddenViews của buildNavSections.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  OPTIONAL_VIEW_IDS,
  getDashboardConfig,
  getDisabledViews,
  isViewEnabled,
  parseSettingsBackup,
} from "./settingsStore.js";
import { buildNavSections } from "./core/navigationRegistry.js";

globalThis.__SGK_TEST__ = true;

const flatIds = (secs) =>
  secs.flatMap((s) => [
    ...(s.items || []).map((i) => i.id),
    ...(s.subsections || []).flatMap((sub) => (sub.items || []).map((i) => i.id)),
  ]);

describe("settings — dashboard config (Bảng điều khiển)", () => {
  it("mặc định: mọi khối Dashboard đều bật", () => {
    const cfg = getDashboardConfig(DEFAULT_SETTINGS);
    for (const k of Object.keys(DEFAULT_SETTINGS.dashboard)) {
      assert.equal(cfg[k], true, `khối ${k} mặc định phải true`);
    }
  });

  it("tắt 1 khối → false; khối thiếu trong settings → true (backup cũ vẫn hiện đủ)", () => {
    const cfg = getDashboardConfig({ dashboard: { showKpis: false } });
    assert.equal(cfg.showKpis, false);
    assert.equal(cfg.showGreeting, true);
    assert.equal(cfg.showMissions, true);
  });

  it("settings null / section hỏng không ném lỗi", () => {
    assert.doesNotThrow(() => getDashboardConfig(null));
    const cfg = getDashboardConfig({ dashboard: "bad-string" });
    assert.equal(cfg.showKpis, true);
  });
});

describe("settings — features (tắt module toàn app)", () => {
  it("mặc định: không module nào bị tắt", () => {
    assert.deepEqual(getDisabledViews(DEFAULT_SETTINGS), []);
  });

  it("chỉ giữ id hợp lệ — loại id lạ, kiểu rác, view cốt lõi", () => {
    const s = { features: { disabled: ["whiteboard", "khong-ton-tai", 123, "dashboard", null] } };
    assert.deepEqual(getDisabledViews(s), ["whiteboard"]);
    assert.equal(isViewEnabled("whiteboard", s), false);
    assert.equal(isViewEnabled("library", s), true);
  });

  it("view cốt lõi không bao giờ nằm trong danh sách được phép tắt", () => {
    const core = ["dashboard", "library", "search", "lessonplans", "datatools", "help"];
    for (const id of core) {
      assert.ok(!OPTIONAL_VIEW_IDS.includes(id), `${id} không được nằm trong OPTIONAL_VIEW_IDS`);
    }
    // P2 • bỏ "concepts" (gộp vào Từ vựng) → còn 15 module tối thiểu
    assert.ok(OPTIONAL_VIEW_IDS.length >= 15, "danh sách module tối thiểu 15 mục");
  });

  it("parseSettingsBackup lọc id lạ + khử trùng trong features.disabled", () => {
    const merged = parseSettingsBackup(
      JSON.stringify({ settings: { features: { disabled: ["vocab", "vocab", "hack", "whiteboard"] } } }),
    );
    assert.deepEqual([...merged.features.disabled].sort(), ["vocab", "whiteboard"]);
  });
});

describe("buildNavSections — ẩn module theo hiddenViews", () => {
  it("ẩn view khỏi điều hướng + subgroup rỗng bị loại hẳn", () => {
    const all = buildNavSections({});
    const hidden = buildNavSections({ hiddenViews: ["matrix", "inventory", "langstats"] });
    assert.ok(flatIds(all).includes("matrix"));
    assert.ok(!flatIds(hidden).includes("matrix"));
    const ws = hidden.find((s) => s.id === "workspace");
    assert.ok(ws, "workspace vẫn còn (đủ view khác)");
    assert.ok(
      !(ws.subsections || []).some((sub) => sub.label === "Công cụ nâng cao"),
      "subgroup rỗng sau khi ẩn hết phải bị loại, không để tiêu đề trống",
    );
  });

  it("ẩn hết view của 1 section → section đó biến mất", () => {
    const hidden = buildNavSections({ hiddenViews: ["webtools"] });
    assert.ok(!hidden.some((s) => s.id === "webtools-section"), "section KHO CÔNG CỤ rỗng phải bị loại");
    assert.ok(hidden.some((s) => s.id === "workspace"), "section khác giữ nguyên");
  });

  it("hiddenViews null/string/invalid không ném lỗi", () => {
    assert.doesNotThrow(() => buildNavSections({ hiddenViews: null }));
    assert.doesNotThrow(() => buildNavSections({ hiddenViews: "not-an-array" }));
    assert.doesNotThrow(() => buildNavSections({ hiddenViews: ["ghost-view"] }));
  });
});
