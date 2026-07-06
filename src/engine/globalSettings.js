const SETTINGS_KEY = 'midi-daw:globalSettings';
const STORAGE_VERSION = 1;

export function defaultGlobalSettings() {
  return {
    compactNavbar: false,
  };
}

export function loadGlobalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultGlobalSettings();
    const parsed = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION || !parsed.settings) return defaultGlobalSettings();
    return { ...defaultGlobalSettings(), ...parsed.settings };
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
