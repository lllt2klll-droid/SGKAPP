import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Môi trường KHÔNG có BroadcastChannel ────────────────────────────────────
// Đặt TRƯỚC khi import: module crossTab.appEvents sẽ không mở được kênh và phải
// degrade êm (không ném lỗi, app vẫn chạy nhờ event `storage` như cũ).

globalThis.window = {
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};
globalThis.BroadcastChannel = undefined;

const { publishCrossTab, subscribeCrossTab, isCrossTabEvent } = await import('./crossTab.js');
const { appEvents, AppEvents, DataDomains } = await import('./appEvents.js');

describe('cross-tab • không có BroadcastChannel (degrade êm)', () => {
  it('kênh không mở được → publish trả false, không ném lỗi', () => {
    assert.equal(publishCrossTab(AppEvents.DATA_UPDATED, { domain: 'x' }), false);
  });

  it('subscribe trả về unsubscribe là hàm (không crash)', () => {
    const off = subscribeCrossTab(() => {});
    assert.equal(typeof off, 'function');
    assert.doesNotThrow(() => off());
  });

  it('emit nội bộ vẫn chạy đủ direct listener + alias', () => {
    const direct = [];
    const catchAll = [];
    const off1 = appEvents.on(AppEvents.WHITEBOARD_UPDATED, (d) => direct.push(d));
    const off2 = appEvents.on(AppEvents.DATA_UPDATED, (d) => catchAll.push(d));

    appEvents.emit(AppEvents.WHITEBOARD_UPDATED, { action: 'created', id: 'b9', domain: DataDomains.WHITEBOARD });

    assert.equal(direct.length, 1, 'listener domain phải chạy');
    assert.equal(catchAll.length, 1, 'alias DATA_UPDATED phải chạy');
    assert.equal(direct[0].id, 'b9');
    assert.equal(catchAll[0].source, AppEvents.WHITEBOARD_UPDATED);

    off1();
    off2();
  });

  it('whitelist vẫn đúng (không phụ thuộc BroadcastChannel)', () => {
    assert.ok(isCrossTabEvent(AppEvents.SCAN_SAVED));
    assert.ok(!isCrossTabEvent(AppEvents.NAVIGATE));
  });
});
