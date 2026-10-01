> **Baseline lịch sử** — số liệu của giai đoạn đó, KHÔNG phản ánh hiện trạng.
> Bản mới: docs/ARCHITECTURE.md / docs/AUDIO.md / docs/TECHNICAL_DEBT.md. Chuyển vào docs/history/ ngày 2026-09-30.


# AUDIO IMPLEMENTATION PLAN — SGK App

> Quét toàn bộ repository trước khi code. Plan này khóa phạm vi, file sửa/tạo, event matrix, quyết định “không phát” để tránh lạm dụng.

## 1. Scan summary

- `new Audio` / `HTMLAudioElement` / `.play()` rải rác: **0** (sạch).
- `notify`/`toast` tập trung: `src/BookReader.jsx:583` là single toast layer (`notify(msg,type)`). Đây là nơi duy nhất cần hook sound semantic.
- Settings hiện tại: `src/settingsStore.js` có `behavior.soundEnabled` (false) nhưng chưa có `soundVolume`/`soundProfile`.
- Settings UI: `src/SettingsCenter.jsx` → `BehaviorSection` đã có toggle Âm thanh + Vibration. Cần mở rộng thành nhóm Âm thanh hoàn chỉnh.
- Modules quan trọng: `BookReader.jsx` (bookmark, pageTurn), `AssistantBubble.jsx` (AI complete), `missionStore.js`/`missionEvents.js` (mission/xp/achievement), `LessonPlansView.jsx`, `ActivitiesView.jsx`, `QuestionBankView.jsx`, `SearchView.jsx`, `DataToolsView.jsx`, `App.jsx` (save/book open/navigation).

## 2. Files to CREATE

```
src/audio/soundAssets.js      # asset map + effectiveVolume helper
src/audio/soundEvents.js      # SOUND_EVENTS + SOUND_PROFILES + SOUND_EVENT_MAP
src/audio/soundManager.js     # central manager (preload, play, stopAll, settings sync)
src/audio/useSound.js         # React hook wrapper
public/audio/ui/*.mp3         # placeholder assets (10 files)
AUDIO_SYSTEM_REPORT.md        # after implementation
```

## 3. Files to MODIFY

| File | Change |
|------|--------|
| `src/settingsStore.js` | Add `behavior.soundVolume=0.35`, `behavior.soundProfile='minimal'` defaults + `migrateBehavior()` called from `loadSettings()` + `deepMerge` backward compat. Also add `SETTINGS_SEARCH_INDEX` entry for sound. |
| `src/SettingsCenter.jsx` | Import soundManager. Replace simple Âm thanh row with full group: toggle + volume slider + profile radios + preview button. Add debounced slider. |
| `src/BookReader.jsx` | Import soundManager + wrap `notify()` to play semantic sound by type. Add `play('bookmark')` on toggle bookmark, `play('pageTurn')` on page change (throttled, profile-gated). |
| `src/AssistantBubble.jsx` | Import soundManager, play `aiComplete` when assistant finishes streaming (loading→done transition), only once per response. |
| `src/missionEvents.js` | Import soundManager, play `missionComplete` + `achievementUnlock` when `applyEvent` returns completedIds/new achievement. Central point avoids widget churn. |
| `src/main.jsx` or `src/App.jsx` | Initialize soundManager early (import side-effect) to subscribe to `sgk:settings-updated`. |
| `src/BookReader.jsx` + `src/teachingDB.js` consumers | `success` sound via notification layer covers save; no duplicate in LessonPlansView/Activities. Explicit `save` event only if caller bypasses notification. |

## 4. Sound events & assets

| Semantic ID | Asset | Base vol | Notes |
|-------------|-------|----------|-------|
| click | click.mp3 | 0.12 | Only profile=standard |
| open | open.mp3 | 0.14 | modal/drawer/panel |
| close | close.mp3 | 0.14 | modal/drawer/panel |
| success | success.mp3 | 0.25 | save/export success |
| error | error.mp3 | 0.22 | error/warning via notify |
| warning | error.mp3 (alias) | 0.22 | alias error |
| notification | notification.mp3 | 0.20 | info toast |
| bookmark | bookmark.mp3 | 0.20 | |
| pageTurn | page-turn.mp3 | 0.10 | low, throttled 400ms |
| save | save.mp3 | 0.25 | alias success if needed |
| aiComplete | ai-complete.mp3 | 0.18 | cực nhẹ |
| missionComplete | mission-complete.mp3 | 0.28 | |
| taskComplete | mission-complete.mp3 (alias) | 0.26 | |
| achievementUnlock | mission-complete.mp3 (alias) | 0.28 | |

Effective volume = `baseVolume * settings.soundVolume`. Respects `prefers-reduced-motion`? we respect `reduceMotion` by muting `pageTurn/click` when enabled — sound vẫn phát nếu user bật nhưng profile minimal đã tắt click.

All assets under `public/audio/ui/`. Placeholder = tiny valid MP3 (can be replaced later without code change). No base64, no bundle bloat.

## 5. Profiles

```js
minimal: { click:false, open:true, close:true, success:true, error:true, warning:true, notification:true, bookmark:true, pageTurn:false, save:true, aiComplete:true, missionComplete:true, taskComplete:true, achievementUnlock:true }
standard: { click:true, open:true, close:true, ... pageTurn:true }
```

Unknown event → silent no-op (no crash).

## 6. Where sound IS integrated (giá trị)

- **Notification layer** (`BookReader.jsx:notify`): `success/error/warning → success/error sound`, `info → notification`. Đây là primary hook, tránh duplicate ở từng save call.
- **BookReader**: bookmark toggle, page navigation (throttled), open/close handled by notification.
- **AssistantBubble**: AI response complete (once per assistant message, not per chunk).
- **Missions**: `missionEvents.emitMissionEvent` → if `completedIds.length>0` play missionComplete; if new achievement unlocked play achievement.
- **DataTools / Search / Collections / QuestionBank / LessonPlans**: rely on notification success path, không thêm trực tiếp.
- **App navigation (menu open/close)**: optional `open/close` on modal/drawer if Settings profile allows, via direct `soundManager.play('open')` in SettingsCenter modal overlay — but gated by profile minimal→open true.

## 7. Where sound is INTENTIONALLY NOT added (tránh lạm dụng)

- Every button click, card click, hover, scroll, typing, list render, widget refresh, XP small delta, streak badge refresh, GlobalSearch typing, DataTable row click, sidebar submenu click, content area click.
- AI streaming chunks.
- BookReader content click / text selection / pan/zoom.

Principle: 1 user action = max 1 sound.

## 8. Settings integration detail

- Migration: in `loadSettings()`, after `deepMerge`, call `migrateBehavior(merged.behavior)` to set defaults `soundVolume ??=0.35`, `soundProfile ??='minimal'` (preserve `soundEnabled=false`).
- `resetSection('behavior')` and `resetAllSettings` automatically pick new defaults via `DEFAULT_SETTINGS`.
- `updateSettings` / `handleChange` already dispatches `sgk:settings-updated`; soundManager subscribes to that event + also polls `loadSettings()` on play for robustness. Real-time, no reload.
- Volume slider: `<input type="range" 0-100>` maps to 0.0-1.0; displays `%`.

## 9. Architecture guarantees

```
Component → soundManager.play(id) → SOUND_EVENT_MAP[id] → profile gate → settings gate → volume calc → HTMLAudioElement cache → .play().catch(()=>{}) 
                 ↑
          settingsStore (soundEnabled/volume/profile)
                 ↑
          sgk:settings-updated
```

- Cache: `Map<string, HTMLAudioElement>` preloaded on first `play` or explicit `preload()`. Clone via `cloneNode()` per play to allow overlap without creating 100 objects.
- Browser autoplay: `audio.play().catch(()=>{})` silent fail, no toast.
- Performance: no `new Audio()` in components; only manager creates elements; lazy preload.
- Accessibility: visual feedback stays primary; sound never required. `reduceMotion` optionally suppresses decorative pageTurn.

## 10. Build & tests

- `npm run build` must pass. No new deps.
- Tests: extend `settingsStore` migration tests; soundManager unit: enabled gate, volume, profile, unknown event, autoplay catch, stopAll. Integration via event mock.

## 11. Execution order

1. Create `src/audio/*`
2. Extend `settingsStore.js`
3. Update `SettingsCenter.jsx`
4. Integrate BookReader + AssistantBubble + missionEvents
5. Create `public/audio/ui` assets
6. Build + verify

## 12. Out of scope

- Background music, floating audio player, sound dashboard, hover sounds, game-style loud sounds.
