import { useCallback, useSyncExternalStore } from "react";
import { soundManager } from "./soundManager.js";
import { loadSettings } from "../settingsStore.js";

function subscribe(cb) {
  window.addEventListener("sgk:settings-updated", cb);
  return () => window.removeEventListener("sgk:settings-updated", cb);
}
function getSnapshot() {
  try {
    const s = loadSettings();
    return { enabled: !!s.behavior?.soundEnabled, volume: s.behavior?.soundVolume ?? 0.35, profile: s.behavior?.soundProfile || "minimal" };
  } catch { return { enabled: false, volume: 0.35, profile: "minimal" }; }
}
function getServerSnapshot() { return { enabled: false, volume: 0.35, profile: "minimal" }; }

export function useSound() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const play = useCallback((event) => soundManager.play(event), []);
  const preview = useCallback((event) => soundManager.preview(event), []);
  const stopAll = useCallback(() => soundManager.stopAll(), []);
  return { play, preview, stopAll, enabled: state.enabled, volume: state.volume, profile: state.profile };
}

export default useSound;
