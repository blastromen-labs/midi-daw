const SETTINGS_KEY = 'midi-daw:globalSettings';
const STORAGE_VERSION = 1;

/** Allowed Live view UI scale percentages (tablet-friendly hit targets). */
export const LIVE_VIEW_UI_SCALES = [100, 125, 150, 175, 200];

export function defaultGlobalSettings() {
  return {
    compactNavbar: false,
    liveViewUiScale: 100,
    /** When true, omit bar-length text on Live view pattern clips. */
    hideLivePatternBarLength: false,
    /** When true, omit launch-mode labels (Loop / Hold / One Shot) on Live clips. */
    hideLivePatternLaunchMode: false,
    /** When true, omit category / MIDI / sampler lines on Live track boxes. */
    hideLiveTrackDetails: false,
  };
}

function normalizeLiveViewUiScale(value) {
  const n = Number(value);
  return LIVE_VIEW_UI_SCALES.includes(n) ? n : 100;
}

export function loadGlobalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultGlobalSettings();
    const parsed = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION || !parsed.settings) return defaultGlobalSettings();
    const merged = { ...defaultGlobalSettings(), ...parsed.settings };
    merged.liveViewUiScale = normalizeLiveViewUiScale(merged.liveViewUiScale);
    merged.hideLivePatternBarLength = !!merged.hideLivePatternBarLength;
    merged.hideLivePatternLaunchMode = !!merged.hideLivePatternLaunchMode;
    merged.hideLiveTrackDetails = !!merged.hideLiveTrackDetails;
    return merged;
  } catch {
    return defaultGlobalSettings();
  }
}

export function persistGlobalSettings(settings) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ version: STORAGE_VERSION, settings })
  );
}
