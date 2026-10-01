// ── Reading progress canonical tests — khóa đồng bộ toàn app ──────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bookProgress, progressCounts, totalPagesRead, READ_STATUS } from './readingProgress.js';

describe('bookProgress', () => {
  it('sách chưa đọc → pct 0, unread', () => {
    const r = bookProgress('a.pdf', {}, {});
    assert.equal(r.pct, 0);
    assert.equal(r.status, READ_STATUS.UNREAD);
    assert.equal(r.page, 0);
  });

  it('đồng bộ công thức thư viện: last=61,total=142 → page=60, pct=43', () => {
    const r = bookProgress('a.pdf', { 'a.pdf': 61 }, { 'a.pdf': 142 });
    assert.equal(r.page, 60);
    assert.equal(r.pct, Math.min(100, Math.round((60 / 141) * 100)));
    assert.equal(r.status, READ_STATUS.READING);
  });

  it('đọc hết → done (pct>=100)', () => {
    const r = bookProgress('a.pdf', { 'a.pdf': 142 }, { 'a.pdf': 142 });
    // page=141, total-1=141 → 100
    assert.equal(r.pct, 100);
    assert.equal(r.status, READ_STATUS.DONE);
  });

  it('thiếu tổng số trang nhưng đã mở → pct>0 (không crash)', () => {
    const r = bookProgress('a.pdf', { 'a.pdf': 5 }, {});
    assert.ok(r.pct > 0);
  });
});

describe('progressCounts / totalPagesRead', () => {
  const books = [{ filename: 'a' }, { filename: 'b' }, { filename: 'c' }];
  const last = { a: 11, b: 51 }; // a: page 10/…; b: page 50; c: unread
  const total = { a: 101, b: 51 }; // a: 10%, b: 100%

  it('đếm đúng trạng thái', () => {
    const c = progressCounts(books, last, total);
    assert.equal(c.reading, 1);
    assert.equal(c.completed, 1);
    assert.equal(c.notStarted, 1);
  });

  it('tổng trang đã đọc', () => {
    assert.equal(totalPagesRead(books, last), 10 + 50);
  });
});
