// ─── WebToolboxView — chống vòng lặp echo save→emit→setState ───
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickExternalTools } from "./webtoolsSync.js";

globalThis.__SGK_TEST__ = true;

const t = (id, over = {}) => ({ id, url: `https://x.dev/${id}`, title: id, category: "dev", pinned: false, favicon: "" });

describe("pickExternalTools — hợp đồng chống vòng lặp Kho công cụ", () => {
  it("nội dung trùng → trả về CHÍNH prev (React bailout, không render/save lại)", () => {
    const prev = [t("a"), t("b")];
    const next = [t("a"), t("b")]; // object mới, nội dung y hệt (chính là echo của saveTools)
    const r = pickExternalTools(prev, next);
    assert.equal(r, prev, "phải trả reference prev để React bỏ qua update");
  });

  it("tab khác đổi thật (thêm/xóa/sửa) → nhận next", () => {
    const prev = [t("a")];
    const next = [t("a"), t("b")];
    assert.equal(pickExternalTools(prev, next), next);
  });

  it("đổi thứ tự (kéo thả cross-tab) → nhận next", () => {
    const prev = [t("a"), t("b")];
    const next = [t("b"), t("a")];
    assert.equal(pickExternalTools(prev, next), next);
  });

  it("next là echo trỏ đúng chính prev → giữ nguyên", () => {
    const prev = [t("a")];
    assert.equal(pickExternalTools(prev, prev), prev);
  });

  it("input không hợp lệ không ném, rơi về bên hợp lý", () => {
    const prev = [t("a")];
    assert.equal(pickExternalTools(prev, null), prev, "next null → giữ prev");
    const next = [t("b")];
    assert.equal(pickExternalTools(null, next), next, "prev null → nhận next");
  });
});
