// ── Scan JSON parse tests — khóa lỗi AI trả JSON bọc kép ───────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJSONSafe } from './scanAIService.js';

describe('parseJSONSafe', () => {
  it('parse JSON object thường', () => {
    const r = parseJSONSafe('{"title":"A","questions":[{"q":"1"}]}');
    assert.equal(r.title, 'A');
    assert.equal(r.questions.length, 1);
  });

  it('bóc markdown fence', () => {
    const r = parseJSONSafe('```json\n{"a":1}\n```');
    assert.equal(r.a, 1);
  });

  it('unwrap JSON bọc kép ("{\\"title\\": ...}") — case thực tế AI trả', () => {
    const inner = { title: 'Phiếu học tập: Chuyển đổi', questions: [{ q: 'a) 30 dm² = ? m²', type: 'mc', origin: 'sgk_original' }] };
    const doubleEncoded = JSON.stringify(JSON.stringify(inner));
    const r = parseJSONSafe(doubleEncoded);
    assert.equal(typeof r, 'object');
    assert.equal(r.title, 'Phiếu học tập: Chuyển đổi');
    assert.ok(Array.isArray(r.questions));
    assert.equal(r.questions[0].origin, 'sgk_original');
  });

  it('trả null khi là văn bản thuần', () => {
    assert.equal(parseJSONSafe('xin chào, đây không phải json'), null);
    assert.equal(parseJSONSafe(''), null);
  });

  it('parse mảng thuần [...] (prompt TOC/quiz yêu cầu mảng)', () => {
    const r = parseJSONSafe('[{"title":"Hat: Vao rung hoa","page":6},{"title":"Doc nhac","page":10}]');
    assert.ok(Array.isArray(r));
    assert.equal(r.length, 2);
    assert.equal(r[0].page, 6);
  });

  it('mảng bọc fence và chữ bao quanh vẫn parse được', () => {
    const arr = '[{"title":"A","page":6},{"title":"B","page":8}]';
    const fenced = parseJSONSafe('```json\n' + arr + '\n```');
    assert.ok(Array.isArray(fenced));
    assert.equal(fenced.length, 2);
    const wrapped = parseJSONSafe('Day la muc luc:\n' + arr + '\nhet');
    assert.ok(Array.isArray(wrapped));
    assert.equal(wrapped.length, 2);
  });

  it('object {"items":[...]} vẫn parse nguyên object', () => {
    const r = parseJSONSafe('{"items":[{"title":"A","page":6}]}');
    assert.equal(typeof r, 'object');
    assert.ok(Array.isArray(r.items));
  });
});
