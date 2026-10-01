// ── Mission consistency — khóa tính đồng bộ registry ──
// Mỗi loại nhiệm vụ phải có: định nghĩa type, template sinh, đích điều hướng.
// Pure test (không chạm localStorage/IndexedDB).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTY,
  MISSION_TYPES,
  MISSION_NAV,
  missionTargetView,
  CATEGORIES,
  LEVELS,
  levelForXp,
  ACHIEVEMENTS,
  MISSION_TEMPLATES,
} from "./missionRegistry.js";

const TYPE_IDS = new Set(Object.values(MISSION_TYPES).map((t) => t.id));

describe("missionRegistry — type/template/nav đồng bộ", () => {
  it("mọi template đều trỏ tới type + difficulty + category hợp lệ", () => {
    assert.ok(MISSION_TEMPLATES.length > 0, "phải có template");
    for (const t of MISSION_TEMPLATES) {
      assert.ok(TYPE_IDS.has(t.type), `template type lạ: ${t.type}`);
      assert.ok(DIFFICULTY[t.difficulty], `difficulty lạ: ${t.difficulty}`);
      assert.ok(CATEGORIES[t.category], `category lạ: ${t.category}`);
      assert.ok(Number(t.target) >= 1, `target phải >= 1: ${t.title}`);
      assert.ok(Number(t.xp) > 0, `xp phải > 0: ${t.title}`);
    }
  });

  it("mọi type đều có đích điều hướng trong MISSION_NAV", () => {
    for (const id of TYPE_IDS) {
      assert.ok(MISSION_NAV[id], `thiếu MISSION_NAV cho type: ${id}`);
      assert.equal(missionTargetView(id), MISSION_NAV[id]);
    }
    assert.equal(missionTargetView("type_lạ"), "tasks");
  });

  it("mỗi type (trừ master-only) đều có ít nhất 1 template", () => {
    const covered = new Set(MISSION_TEMPLATES.map((t) => t.type));
    for (const id of TYPE_IDS) {
      assert.ok(covered.has(id), `type không bao giờ được sinh: ${id}`);
    }
  });

  it("event trong MISSION_TYPES là duy nhất", () => {
    const events = Object.values(MISSION_TYPES).map((t) => t.event);
    assert.equal(new Set(events).size, events.length, "event bị trùng");
  });
});

describe("missionRegistry — level/achievement", () => {
  it("LEVELS tăng dần và levelForXp bao phủ 0 → max", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      assert.ok(LEVELS[i].minXp > LEVELS[i - 1].minXp, "minXp phải tăng dần");
    }
    assert.equal(levelForXp(0).current.level, 1);
    const top = LEVELS[LEVELS.length - 1];
    assert.equal(levelForXp(top.minXp + 999999).current.level, top.level);
  });

  it("achievement check chịu được stats thiếu field (không throw)", () => {
    const stats = {
      totalPagesRead: 0, totalEvidence: 0, totalClips: 0, totalConcepts: 0,
      totalRefs: 0, totalIdeas: 0, totalLessonPlans: 0, totalQuestions: 0,
      totalVocab: 0, totalBookmarks: 0, totalXp: 0, level: 1,
      currentStreak: 0, longestStreak: 0, totalDaysCompleted: 0,
    };
    for (const a of ACHIEVEMENTS) {
      assert.equal(typeof a.check(stats), "boolean", a.id);
    }
  });
});
