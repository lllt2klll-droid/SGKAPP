# AUDIO — SGK App

> Gộp `AUDIO_IMPLEMENTATION_PLAN.md` + `AUDIO_SYSTEM_REPORT.md` (root), cập nhật **2026-09-30**.

## 1. Nguyên tắc

- **Một nơi phát âm:** chỉ `src/audio/soundManager.js` được tạo `new Audio()` — component chỉ gọi
  `soundManager.play("event")`. Không `new Audio()` ở bất kỳ đâu khác.
- **1 hành động = tối đa 1 âm thanh.** Không âm cho hover/scroll/typing/click mọi nút.
- Âm thanh là **phụ trợ**: tắt vẫn dùng được mọi chức năng; lỗi âm thanh không bao giờ chặn lưu dữ liệu.

## 2. Kiến trúc

```
Component ──► soundManager.play(event)
                 │ normalizeEvent → profile gate → settings gate → throttle
                 ├─ 1) WebAudio SYNTH_PRESETS (WebAudio, không phụ thuộc file)   ← luôn thử trước
                 └─ 2) File .wav public/audio/ui/* (HTMLAudioElement cache + cloneNode)
SettingsStore (behavior.soundEnabled / soundVolume / soundProfile) ──appEvents──► soundManager
```

- **Nghe settings realtime:** `soundManager` subscribe `appEvents.SETTINGS_UPDATED` — đổi âm lượng/kiểu
  có hiệu lực ngay ở lần phát kế tiếp, không cần reload.
- **Cache:** `Map<event, HTMLAudioElement>`, mỗi lần phát `cloneNode()` để chồng tiếng được mà không tạo hàng trăm object.
- **Autoplay:** `audio.play().catch(()=>{})` — bị trình duyệt chặn thì im lặng, không toast.
- **Throttle:** `pageTurn` 380 ms (chống lật trang liên tục gây spam).

## 3. File

| File | Vai trò |
|---|---|
| `src/audio/soundManager.js` | manager: `play/preview/stopAll/preload/setEnabled/setVolume/set/clearOverride`, synth presets, throttle |
| `src/audio/soundEvents.js` | `SOUND_EVENTS`, `SOUND_PROFILES` (minimal/standard), `normalizeEvent`, `isEventEnabledForProfile` |
| `src/audio/soundAssets.js` | `SOUND_ASSETS` (id → file `.wav`), `SOUND_BASE_VOLUME`, `effectiveVolume()` |
| `src/audio/useSound.js` | hook React (`useSound()`) |
| ~~`src/audio/index.js`~~ | barrel export — **0 importer, chuyển `docs/_attic/src-dead/` (2026-10-05)**; các file audio import trực tiếp `./audio/soundManager.js` |
| `public/audio/ui/*.wav` | 11 file âm thật (3–10 KB) |

## 4. Event & âm lượng

| ID | Asset | Base vol | minimal | standard |
|---|---|---|---|---|
| click | click.wav | 0.12 | ✗ | ✓ |
| open / close | open.wav / close.wav | 0.14 | ✓ | ✓ |
| success | success.wav | 0.25 | ✓ | ✓ |
| error | error.wav | 0.22 | ✓ | ✓ |
| warning | → error | 0.22 | ✓ | ✓ |
| notification | notification.wav | 0.20 | ✓ | ✓ |
| bookmark | bookmark.wav | 0.20 | ✓ | ✓ |
| pageTurn | page-turn.wav | 0.10 | ✗ | ✓ (throttle 380 ms) |
| save | save.wav | 0.25 | ✓ | ✓ |
| aiComplete | ai-complete.wav | 0.18 | ✓ | ✓ |
| missionComplete | mission-complete.wav | 0.28 | ✓ | ✓ |
| taskComplete | → missionComplete | 0.26 | ✓ | ✓ |
| achievementUnlock | → missionComplete | 0.28 | ✓ | ✓ |

`âm lượng thực = base × behavior.soundVolume` (mặc định 0.35). Sự kiện lạ → no-op.

## 5. Synth presets (WebAudio)

Ngoài file `.wav`, `SYNTH_PRESETS` phát chuỗi nốt sin/tam giác bằng `OscillatorNode + GainNode`
(có `delay` cho hợp âm 2–3 nốt: save, aiComplete, missionComplete...). Đây là nguồn âm chính khi
trình duyệt chưa load kịp file hoặc muốn tiếng "sạch" không phụ thuộc asset.

## 6. Settings

- Store: `settingsStore.js` → `behavior.soundEnabled` (mặc định **false**), `soundVolume` (0.35),
  `soundProfile` (`minimal`), có `migrateBehavior()` backward-compat.
- UI: `SettingsCenter.jsx` → **Cài đặt → Hành vi → Âm thanh**: checkbox bật/tắt, slider 0–100%,
  radio Tối giản/Tiêu chuẩn, nút **[🔊 Thử âm thanh]** → `soundManager.preview("success")`
  (phát force kể cả khi đang tắt).
- Tôn trọng `accessibility.reduceMotion`: tắt tiếng `click`/`pageTurn` trang trí.

## 7. Nơi đã tích hợp

| Module | Khi nào phát |
|---|---|
| `BookReader.jsx` | `notify(type)` (success/error/info → success/error/notification) — **mọi module gọi `notify` được âm thanh miễn phí**; `bookmark` khi đổi đánh dấu; `pageTurn` khi trang thật sự đổi |
| `AssistantBubble.jsx` | `aiComplete` 1 lần khi AI trả lời xong (không phát mỗi chunk) |
| `missionEvents.js` | `missionComplete` khi `completedIds>0`; `achievementUnlock` khi mở khoá thành tựu |
| `WhiteboardView.jsx` | thao tác bảng trắng (theo profile) |

**Cố ý KHÔNG tích hợp:** mọi nút bấm, hover, scroll, gõ phím, render list, refresh widget, XP nhỏ,
GlobalSearch gõ, DataTable click, click vùng nội dung sách, streaming AI.

## 8. Asset

```
public/audio/ui/   (11 file .wav — âm thật, đã kiểm tra byte không phải silent)
  click · open · close · success · error · notification · bookmark
  page-turn · save · ai-complete · mission-complete
```

- File `.mp3` trùng lặp (không nơi nào tham chiếu) đã xoá ngày 2026-09-30.
- Không base64 trong JS → không phình bundle; asset là file tĩnh thay được mà không sửa code
  (giữ nguyên tên file).

## 9. Kiểm chứng hiện tại

- `npm run build` ✓ · `npm test` 260/260 ✓ · `npm run lint` 0/0 ✓.
- Chưa có unit test riêng cho `soundManager` (file `src/audio/*.test.js` chưa tồn tại) — mục cần bổ sung.
