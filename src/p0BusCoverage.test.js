// P0 • Khóa hành vi bus cho 9 module từng 0-event / thiếu domain.
// Mỗi CRUD phải bắn event domain riêng (+ alias DATA_UPDATED tự sinh) kèm domain,
// và event đó phải nằm trong whitelist cross-tab để sang được tab khác.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Môi trường Node không có localStorage — dựng shim như trashStore.test.js
// để các service ghi đọc được (không có shim, save thất bại và test bus vô nghĩa).
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      get length() { return m.size; },
      key: (i) => [...m.keys()][i] || null,
    };
  })();
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
}

import { appEvents, AppEvents, DataDomains } from "./core/appEvents.js";
import { isCrossTabEvent } from "./core/crossTab.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

function collect(...eventNames) {
  const got = Object.fromEntries(eventNames.map((e) => [e, []]));
  const offs = eventNames.map((e) => appEvents.on(e, (detail) => got[e].push(detail)));
  return { got, off: () => offs.forEach((fn) => { try { fn(); } catch {} }) };
}

// ── 1. Event + domain mới tồn tại ──────────────────────────────────────
test("P0: AppEvents/DataDomains có 3 domain mới (vocab/research/internship)", () => {
  assert.equal(AppEvents.VOCAB_UPDATED, "sgk:vocab-updated");
  assert.equal(AppEvents.RESEARCH_UPDATED, "sgk:research-updated");
  assert.equal(AppEvents.INTERNSHIP_UPDATED, "sgk:internship-updated");
  assert.equal(DataDomains.VOCAB, "vocab");
  assert.equal(DataDomains.INTERNSHIP, "internship");
  assert.equal(DataDomains.RESEARCH, "research");
  assert.equal(DataDomains.QUIZ, "quiz");
});

// ── 2. Whitelist cross-tab cover đủ event domain ───────────────────────
test("P0: whitelist cross-tab gồm event cũ + 3 event mới", () => {
  for (const e of [
    AppEvents.DATA_UPDATED,
    AppEvents.LESSON_PLAN_UPDATED,
    AppEvents.ACTIVITY_UPDATED,
    AppEvents.QUESTION_UPDATED,
    AppEvents.WORKSHEET_UPDATED,
    AppEvents.VOCAB_UPDATED,
    AppEvents.RESEARCH_UPDATED,
    AppEvents.INTERNSHIP_UPDATED,
  ]) assert.ok(isCrossTabEvent(e), `thiếu whitelist: ${e}`);
  assert.ok(!isCrossTabEvent(AppEvents.NAVIGATE), "NAVIGATE không được lọt vào whitelist");
});

// ── 3. teachingDB: activity/question/worksheet bắn event riêng + domain ─
test("P0: teachingDB activities bắn ACTIVITY_UPDATED kèm domain", async () => {
  const t = await import("./teachingDB.js");
  const { got, off } = collect(AppEvents.ACTIVITY_UPDATED, AppEvents.DATA_UPDATED);
  try {
    const base = got[AppEvents.DATA_UPDATED].length;
    const item = t.addActivity({ name: "P0 test act", content: "x", tags: [] });
    assert.ok(got[AppEvents.ACTIVITY_UPDATED].length >= 1, "addActivity không bắn ACTIVITY_UPDATED");
    assert.equal(got[AppEvents.ACTIVITY_UPDATED].at(-1).domain, DataDomains.ACTIVITIES);
    // đúng 1 alias generic/op (không double-fire MODEL A)
    assert.equal(
      got[AppEvents.DATA_UPDATED].slice(base).filter((d) => d && d.domain === DataDomains.ACTIVITIES).length,
      1,
      "addActivity bắn thừa DATA_UPDATED",
    );
    t.updateActivity(item.id, { name: "P0 test act 2" });
    assert.equal(got[AppEvents.ACTIVITY_UPDATED].at(-1).op, "updateActivity");
    t.deleteActivity(item.id);
    assert.equal(got[AppEvents.ACTIVITY_UPDATED].at(-1).op, "deleteActivity");
  } finally { off(); }
});

test("P0: teachingDB questions/worksheets bắn event riêng kèm domain", async () => {
  const t = await import("./teachingDB.js");
  const { got, off } = collect(AppEvents.QUESTION_UPDATED, AppEvents.WORKSHEET_UPDATED);
  try {
    const q = t.addQuestion({ type: "fill", question: "P0 ?", answer: "a" });
    assert.equal(got[AppEvents.QUESTION_UPDATED].at(-1).domain, DataDomains.QUESTIONS);
    t.deleteQuestion(q.id);
    assert.equal(got[AppEvents.QUESTION_UPDATED].at(-1).op, "deleteQuestion");
    const ws = t.saveWorksheet({ id: "p0-ws", title: "P0 ws", questions: [] });
    assert.equal(got[AppEvents.WORKSHEET_UPDATED].at(-1).domain, DataDomains.WORKSHEETS);
    t.deleteWorksheet(ws.id);
    assert.equal(got[AppEvents.WORKSHEET_UPDATED].at(-1).op, "deleteWorksheet");
  } finally { off(); }
});

// ── 4. planModel: save/duplicate/delete bắn LESSON_PLAN_UPDATED ────────
test("P0: planModel save/delete bắn LESSON_PLAN_UPDATED kèm domain", async () => {
  const pm = await import("./khbd/planModel.js");
  const { got, off } = collect(AppEvents.LESSON_PLAN_UPDATED);
  try {
    const plan = pm.mkPlan();
    plan.title = "P0 plan";
    const fresh = pm.savePlan(plan);
    assert.ok(got[AppEvents.LESSON_PLAN_UPDATED].length >= 1, "savePlan im lặng với bus");
    assert.equal(got[AppEvents.LESSON_PLAN_UPDATED].at(-1).domain, DataDomains.LESSON_PLANS);
    assert.equal(got[AppEvents.LESSON_PLAN_UPDATED].at(-1).op, "createPlan");
    pm.deletePlan(fresh.id);
    assert.equal(got[AppEvents.LESSON_PLAN_UPDATED].at(-1).op, "deletePlan");
  } finally { off(); }
});

// ── 5. userdata: vocab bắn VOCAB_UPDATED (không double generic) ─────────
test("P0: userdata vocab bắn VOCAB_UPDATED kèm domain", async () => {
  const u = await import("./userdata.js");
  const { got, off } = collect(AppEvents.VOCAB_UPDATED, AppEvents.DATA_UPDATED);
  try {
    const before = got[AppEvents.DATA_UPDATED].length;
    u.addVocabEntry({ word: "P0word", meaning: "nghia", file: "p0.pdf", page: 1 });
    assert.ok(got[AppEvents.VOCAB_UPDATED].length >= 1, "addVocabEntry không bắn VOCAB_UPDATED");
    assert.equal(got[AppEvents.VOCAB_UPDATED].at(-1).domain, DataDomains.VOCAB);
    // alias sinh đúng 1 generic mang domain vocab (alias giữ detail.source gốc,
    // nên lọc theo domain chứ không theo source)
    const aliasHits = got[AppEvents.DATA_UPDATED].slice(before).filter((d) => d && d.domain === DataDomains.VOCAB);
    assert.equal(aliasHits.length, 1, `alias DATA_UPDATED phải đúng 1, thấy ${aliasHits.length}`);
    const id = (u.getVocab().find((e) => e.word === "P0word") || {}).id;
    if (id) u.removeVocabEntry(id);
    assert.equal(got[AppEvents.VOCAB_UPDATED].at(-1).op, "removeVocabEntry");
  } finally { off(); }
});

// ── 6. researchDB: đường fallback (Node không có IDB) bắn RESEARCH_UPDATED ─
test("P0: researchDB updateConcept bắn RESEARCH_UPDATED kèm domain", async () => {
  const r = await import("./researchDB.js");
  const { got, off } = collect(AppEvents.RESEARCH_UPDATED);
  try {
    await r.updateConcept("p0-nope-id", { term: "x" });
    assert.ok(got[AppEvents.RESEARCH_UPDATED].length >= 1, "updateConcept không notify bus");
    assert.equal(got[AppEvents.RESEARCH_UPDATED].at(-1).domain, DataDomains.CONCEPTS);
  } finally { off(); }
});

// ── 7. InternshipView đi qua bus (check text, tránh import JSX) ─────────
test("P0: InternshipView saveEntries bắn INTERNSHIP_UPDATED", () => {
  const src = readSrc("InternshipView.jsx");
  assert.ok(src.includes("INTERNSHIP_UPDATED"), "InternshipView chưa emit INTERNSHIP_UPDATED");
  assert.ok(src.includes("DataDomains.INTERNSHIP"), "thiếu domain internship");
});
