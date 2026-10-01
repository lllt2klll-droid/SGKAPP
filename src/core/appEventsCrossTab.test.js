import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Cross-tab qua BroadcastChannel ──────────────────────────────────────────
// Môi trường giống trình duyệt phải được dựng TRƯỚC KHI import appEvents,
// vì appEvents tạo kênh ngay khi module được nạp.

globalThis.window = {
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};

// Kênh giả: postMessage gửi cho MỌI kênh khác cùng tên (BroadcastChannel không
// giao lại cho chính nó) — đúng hành vi đang dùng ở trình duyệt.
class FakeBroadcastChannel {
  static instances = [];
  constructor(name) {
    this.name = name;
    this.handlers = [];
    FakeBroadcastChannel.instances.push(this);
  }
  addEventListener(type, fn) {
    if (type === 'message') this.handlers.push(fn);
  }
  removeEventListener(type, fn) {
    this.handlers = this.handlers.filter((h) => h !== fn);
  }
  postMessage(data) {
    for (const c of FakeBroadcastChannel.instances) {
      if (c === this) continue;
      for (const h of [...c.handlers]) {
        try { h({ data }); } catch {}
      }
    }
  }
}
globalThis.BroadcastChannel = FakeBroadcastChannel;

const peer = new FakeBroadcastChannel('sgk:bus'); // đại diện "tab khác"
const { appEvents, AppEvents, DataDomains } = await import('./appEvents.js');
const { isCrossTabEvent } = await import('./crossTab.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Ghi lại mọi message mà "tab khác" nhận được. */
function spyPeer() {
  const got = [];
  const fn = (e) => got.push(e.data);
  peer.addEventListener('message', fn);
  return { got, off: () => peer.removeEventListener('message', fn) };
}

describe('cross-tab • BroadcastChannel', () => {

  it('whitelist: chỉ sự kiện dữ liệu được đồng bộ, điều hướng thì không', () => {
    assert.ok(isCrossTabEvent(AppEvents.DATA_UPDATED), 'data-updated phải sync');
    assert.ok(isCrossTabEvent(AppEvents.WHITEBOARD_UPDATED), 'whiteboard phải sync (IDB)');
    assert.ok(isCrossTabEvent(AppEvents.SCAN_SAVED), 'scan phải sync');
    assert.ok(!isCrossTabEvent(AppEvents.NAVIGATE), 'không broadcast điều hướng');
    assert.ok(!isCrossTabEvent(AppEvents.OPEN_GLOBAL_SEARCH), 'không broadcast UI');
    assert.ok(!isCrossTabEvent(AppEvents.SEND_TO_WHITEBOARD), 'không broadcast hành động cục bộ');
    assert.ok(!isCrossTabEvent(AppEvents.SETTINGS_UPDATED), 'settings đã có event storage');
  });

  it('emit WHITEBOARD_UPDATED → tab khác nhận đúng event + detail', async () => {
    const { got, off } = spyPeer();
    appEvents.emit(AppEvents.WHITEBOARD_UPDATED, {
      action: 'created', id: 'b1', domain: DataDomains.WHITEBOARD,
    });
    await flush();
    assert.equal(got.length, 1, 'tab khác phải nhận đúng 1 message');
    assert.equal(got[0].eventName, AppEvents.WHITEBOARD_UPDATED);
    assert.equal(got[0].detail.action, 'created');
    assert.equal(got[0].detail.id, 'b1');
    assert.ok(got[0].from && got[0].from.length > 0, 'message phải mang sender id');
    off();
  });

  it('emit DATA_UPDATED → tab khác nhận (kho IndexedDB không có event storage)', async () => {
    const { got, off } = spyPeer();
    appEvents.emit(AppEvents.DATA_UPDATED, { domain: DataDomains.MISSIONS, source: 'local' });
    await flush();
    assert.equal(got.length, 1);
    assert.equal(got[0].eventName, AppEvents.DATA_UPDATED);
    assert.equal(got[0].detail.domain, DataDomains.MISSIONS);
    off();
  });

  it('không broadcast NAVIGATE (tab khác không được nhảy view)', async () => {
    const { got, off } = spyPeer();
    appEvents.emit(AppEvents.NAVIGATE, { view: 'library' });
    await flush();
    assert.equal(got.length, 0, 'NAVIGATE không được phát ra kênh');
    off();
  });

  it('không phát lại detail là echo storage (chặn vòng lặp storage → broadcast)', async () => {
    const { got, off } = spyPeer();
    appEvents.emit(AppEvents.DATA_UPDATED, { domain: DataDomains.BOOKS, source: 'cross-tab-sync' });
    await flush();
    assert.equal(got.length, 0, 'echo storage không được broadcast ngược lại');
    off();
  });

  it('nhận message từ tab khác → listener local chạy với đúng detail', async () => {
    const seen = [];
    const off = appEvents.on(AppEvents.SCAN_SAVED, (d) => seen.push(d));
    peer.postMessage({ from: 'tab-khac', eventName: AppEvents.SCAN_SAVED, detail: { id: 's1' } });
    await flush();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].id, 's1');
    off();
  });

  it('nhận message từ tab khác → KHÔNG phát ngược lại kênh (không ping-pong)', async () => {
    const { got, off: offSpy } = spyPeer();
    const seen = [];
    const off = appEvents.on(AppEvents.LESSON_PLAN_UPDATED, (d) => seen.push(d));

    peer.postMessage({ from: 'tab-khac', eventName: AppEvents.LESSON_PLAN_UPDATED, detail: { id: 'p1' } });
    await flush();
    assert.equal(seen.length, 1, 'listener phải chạy');
    assert.equal(got.length, 0, 'tab này không được broadcast lại reaction của mình');

    off();
    offSpy();
  });

  it('bỏ qua message mang sender id của chính tab này (chống loop)', async () => {
    // Lấy sender id thật từ một message hợp lệ
    const { got, off: offSpy } = spyPeer();
    appEvents.emit(AppEvents.WEBTOOLS_UPDATED, { id: 'w1' });
    await flush();
    const senderId = got[0].from;
    offSpy();

    const seen = [];
    const off = appEvents.on(AppEvents.WEBTOOLS_UPDATED, (d) => seen.push(d));
    peer.postMessage({ from: senderId, eventName: AppEvents.WEBTOOLS_UPDATED, detail: { id: 'w1' } });
    await flush();
    assert.equal(seen.length, 0, 'message có sender id của chính tab phải bị bỏ qua');
    off();
  });

  it('publishCrossTab trả false với sự kiện ngoài whitelist / echo storage', async () => {
    const { publishCrossTab } = await import('./crossTab.js');
    assert.equal(publishCrossTab(AppEvents.NAVIGATE, { view: 'library' }), false, 'ngoài whitelist');
    assert.equal(publishCrossTab('sgk:unknown-event', {}), false, 'không có trong whitelist');
    assert.equal(
      publishCrossTab(AppEvents.DATA_UPDATED, { domain: 'x', source: 'cross-tab-sync' }),
      false,
      'echo storage không được phát',
    );
  });
});
