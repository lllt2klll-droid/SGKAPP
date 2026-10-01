> **Baseline lịch sử** — số liệu của giai đoạn đó, KHÔNG phản ánh hiện trạng.
> Bản mới: docs/ARCHITECTURE.md / docs/AUDIO.md / docs/TECHNICAL_DEBT.md. Chuyển vào docs/history/ ngày 2026-09-30.


# AUDIO SYSTEM REPORT — SGK App

## 1. Architecture

```
Component
  ↓ soundManager.play(event)
SoundManager (src/audio/soundManager.js)
  ↓ normalizeEvent → profile gate → settings gate → effectiveVolume
SettingsStore (src/settingsStore.js:behavior.soundEnabled/volume/profile)
  ↓ sgk:settings-updated (real-time)
Audio Asset (public/audio/ui/*.mp3)
```

- Single source: `src/audio/` — no `new Audio()` outside `soundManager.js:60`.
- Cache: `Map<event, HTMLAudioElement>` + `cloneNode()` per play (overlap without 100 objects).
- Autoplay policy: `audio.play().catch(()=>{})` silently ignores browser block.
- Preload lazy: on `sgk:settings-updated` when enabled, or first play.

## 2. Sound Events

| ID | Asset | BaseVol | Profile minimal | Profile standard |
|----|-------|---------|-----------------|------------------|
| click | click.mp3 | 0.12 | off | on |
| open | open.mp3 | 0.14 | on | on |
| close | close.mp3 | 0.14 | on | on |
| success | success.mp3 | 0.25 | on | on |
| error | error.mp3 | 0.22 | on | on |
| warning | error.mp3 alias | 0.22 | on | on |
| notification | notification.mp3 | 0.20 | on | on |
| bookmark | bookmark.mp3 | 0.20 | on | on |
| pageTurn | page-turn.mp3 | 0.10 | off | on (throttled 380ms) |
| save | save.mp3 | 0.25 | on | on |
| aiComplete | ai-complete.mp3 | 0.18 | on | on |
| missionComplete | mission-complete.mp3 | 0.28 | on | on |
| taskComplete | missionComplete alias | 0.26 | on | on |
| achievementUnlock | missionComplete alias | 0.28 | on | on |

Effective volume = `base * behavior.soundVolume` (default 0.35). Unknown event → no-op.

## 3. Settings Integration

- `src/settingsStore.js:85-93` added `soundVolume:0.35`, `soundProfile:'minimal'` with `migrateBehavior()` (backward compat). Existing users keep `soundEnabled:false`.
- `loadSettings()` calls `migrateBehavior` for both fresh and migrated stores.
- `resetSection('behavior')` / `resetAllSettings()` respect defaults.
- Search index extended for `sound/âm thanh/volume`.
- Real-time: `sgk:settings-updated` consumed by `soundManager` (clears overrides, lazy preloads). Volume/profile changes apply to next play instantly, no reload.

## 4. Settings UI

- `src/SettingsCenter.jsx:1953` — `BehaviorSection` now has sub-group `Cài đặt → Hành vi → Âm thanh`:
  - `[ ] Bật âm thanh giao diện` (checkbox, shows Đang bật/tắt)
  - `Âm lượng — 35%` slider 0-100 → `soundVolume` 0.0-1.0, disabled when off
  - `Kiểu âm thanh` radios: Tối giản / Tiêu chuẩn
  - `[ 🔊 Thử âm thanh ]` calls `soundManager.preview('success')` (force plays even when disabled)

## 5. Modules Integrated

| Module | Hook | Sound |
|--------|------|-------|
| `src/BookReader.jsx:583` | `notify()` wrapper | success/error/warning→success/error, info→notification (central, avoids duplicate per save) |
| `src/BookReader.jsx:1220` | `handleToggleBookmark` | bookmark |
| `src/BookReader.jsx:1211` | `goToPage` | pageTurn (only when page actually changes, throttled, profile-gated) |
| `src/AssistantBubble.jsx:464` | after `appendBot` on AI done | aiComplete (once per response, not per chunk) |
| `src/missionEvents.js:18` | `emitMissionEvent` | missionComplete when `completedIds>0`, achievementUnlock when new achievement |

Intentionally NOT integrated: every button click, card hover, scroll, typing, list render, widget polling refresh, XP small delta, GlobalSearch typing, DataTable interactions. Adheres to “1 action = max 1 sound”.

## 6. BookReader specifics

- Uses central manager, no separate audio system.
- `pageTurn` base 0.10 × userVolume, throttled 380ms, disabled in minimal profile.
- `bookmark` 0.20 × userVolume.
- Content area clicks do not trigger sound.

## 7. AI Assistant

- Only on `callAI` complete → `aiComplete` (0.18 base). No streaming chunk sounds. Silent if sound disabled.

## 8. Notifications / Toasts

- Single layer `BookReader.jsx:notify` maps type→semantic sound. Modules calling `notify` get sound for free; they must NOT also call `soundManager.play('success')` to avoid duplication.

## 9. Missions / Gamification

- `missionEvents.emitMissionEvent` is central gate. Plays only on actual mission completion / achievement unlock, not on widget refresh or XP tick.

## 10. Performance

- No per-click `new Audio()`. One cached element per event, cloned on play.
- No bundle bloat: assets are static 1.6KB silent placeholders in `public/audio/ui/` (replace later without code change, no base64 in JS).
- Throttle prevents pageTurn spam.

## 11. Accessibility

- Sound never replaces visual feedback.
- Respects `settings.accessibility.reduceMotion` (mutes click/pageTurn when enabled).
- All features work with sound off (default off).

## 12. Autoplay / Error handling

- `try { await audio.play() } catch {}` silent fail.
- Unknown event / missing asset → return false, no crash.
- Audio failure never blocks `saveData` etc. (sound is enhancement).

## 13. Assets

```
public/audio/ui/
  click.mp3, open.mp3, close.mp3, success.mp3, error.mp3,
  notification.mp3, bookmark.mp3, page-turn.mp3, save.mp3,
  ai-complete.mp3, mission-complete.mp3
```
All 1605 bytes silent placeholders (valid MP3) — replace with designed subtle sounds without code change.

## 14. Tests & Build

- Build: `npm run build` ✅ (vite 8.2.1, 59 precache entries, no errors)
- Tests: `npm test` ✅ 173 pass, 0 fail
- Verification: `grep new Audio` → only `src/audio/soundManager.js:60`; no `HTMLAudioElement` leakage.

## 15. Remaining / Next steps

- Replace placeholder MP3s with designed subtle tones (keep same filenames).
- Optional: add `open/close` sound to `SettingsCenter` overlay and `App` modal open if desired (profile-gated).
- No breaking changes to business logic.
