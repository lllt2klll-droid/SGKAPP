import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { storageNoticeLevel, storageNoticeText, STORAGE_WARN_PCT, STORAGE_DANGER_PCT } = await import('./storageNotice.js');

describe('A1 • Ngưỡng cảnh báo bộ nhớ trình duyệt', () => {
  it('ngưỡng cố định: warn 90%, danger 98%', () => {
    assert.equal(STORAGE_WARN_PCT, 90);
    assert.equal(STORAGE_DANGER_PCT, 98);
  });

  it('dưới ngưỡng → ok (không hiện banner, không làm phiền)', () => {
    assert.deepEqual(storageNoticeLevel(0, 100), { level: 'ok', pct: 0 });
    assert.equal(storageNoticeLevel(50, 100).level, 'ok');
    assert.equal(storageNoticeLevel(89, 100).level, 'ok', '89% chưa cảnh báo');
    assert.equal(storageNoticeLevel(8949, 10000).level, 'ok', '89.49% làm tròn xuống → vẫn ok');
    assert.equal(storageNoticeLevel(8999, 10000).level, 'warn', '89.5%+ làm tròn lên 90 → cảnh báo sớm hơn');
  });

  it('từ 90% → warn; từ 98% → danger; bão hòa ở 100%', () => {
    assert.equal(storageNoticeLevel(90, 100).level, 'warn');
    assert.equal(storageNoticeLevel(97, 100).level, 'warn');
    assert.equal(storageNoticeLevel(98, 100).level, 'danger');
    assert.equal(storageNoticeLevel(999, 100).level, 'danger');
    assert.equal(storageNoticeLevel(98, 100).pct, 98, 'không vượt 100%');
    assert.equal(storageNoticeLevel(100, 100).pct, 100);
  });

  it('giá trị rác / quota 0 / không có số → null (không bắn banner ảo)', () => {
    assert.equal(storageNoticeLevel(1, 0), null, 'quota 0 → không chia được');
    assert.equal(storageNoticeLevel(0, 0), null);
    assert.equal(storageNoticeLevel(undefined, undefined), null);
    assert.equal(storageNoticeLevel(NaN, 100), null);
    assert.equal(storageNoticeLevel(50, NaN), null);
    assert.equal(storageNoticeLevel(-1, 100), null, 'usage âm là dữ liệu hỏng');
    assert.equal(storageNoticeLevel(null, null), null);
  });

  it('quy đổi bytes thật (1GB quota, 950MB dùng → warn 95%)', () => {
    const GB = 1073741824;
    assert.deepEqual(storageNoticeLevel(0.95 * GB, GB), { level: 'warn', pct: 95 });
    assert.equal(storageNoticeLevel(0.99 * GB, GB).level, 'danger');
    assert.equal(storageNoticeLevel(0.5 * GB, GB).level, 'ok');
  });

  it('nội dung cảnh báo nêu % + chỉ dẫn "Sao lưu ngay"', () => {
    const danger = storageNoticeText('danger', 98);
    assert.match(danger, /98%/);
    assert.match(danger, /Sao lưu ngay/);
    assert.match(danger, /Sao lưu & Khôi phục/);

    const warn = storageNoticeText('warn', 93);
    assert.match(warn, /93%/);
    assert.match(warn, /sao lưu sớm/i);
    assert.ok(!warn.includes('bị mất'), 'chưa tới mức báo mất dữ liệu thì đừng hù');

    assert.equal(storageNoticeText('ok', 10), '', 'ok không có nội dung');
  });
});
