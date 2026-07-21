/** Platform modifier label for Cmd (macOS) vs Ctrl (Windows/Linux). */
export function modifierKeyLabel() {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  const isApple = /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS/.test(ua);
  return isApple ? '⌘' : 'Ctrl';
}

/**
 * All app shortcuts for the help modal. `keys` may include `{mod}` which is
 * replaced with the platform modifier at render time.
 */
export function getShortcutSections(mod = modifierKeyLabel()) {
  const m = (keys) => keys.replaceAll('{mod}', mod);

  return [
    {
      title: 'Transport & view',
      items: [
        { keys: m('Space'), description: 'Play / stop' },
        { keys: m('Tab'), description: 'Toggle piano roll ↔ live view' },
      ],
    },
    {
      title: 'Piano roll — keyboard',
      items: [
        { keys: m('{mod}+Z'), description: 'Undo note edit' },
        { keys: m('{mod}+Shift+Z'), description: 'Redo note edit' },
        { keys: m('{mod}+Y'), description: 'Redo note edit (Windows)' },
        { keys: m('{mod}+A'), description: 'Select all notes' },
        { keys: m('{mod}+C'), description: 'Copy selection' },
        { keys: m('{mod}+V'), description: 'Paste at marker' },
        { keys: m('Delete / Backspace'), description: 'Delete selected notes' },
      ],
    },
    {
      title: 'Piano roll — mouse',
      items: [
        { keys: m('Click empty cell'), description: 'Place a note' },
        { keys: m('Drag on empty cells'), description: 'Paint notes across cells' },
        { keys: m('Shift+drag empty'), description: 'Draw one long note (stretch length)' },
        { keys: m('Drag note'), description: 'Move note (or selection)' },
        { keys: m('Shift+drag note'), description: 'Clone note(s) and drag copies' },
        { keys: m('Drag note right edge'), description: 'Resize note length' },
        { keys: m('Right-click / right-drag'), description: 'Erase notes' },
        { keys: m('{mod}+drag'), description: 'Marquee select' },
        { keys: m('{mod}+Shift+drag'), description: 'Add to selection (marquee)' },
        { keys: m('Alt+click grid'), description: 'Set paste / play marker' },
      ],
    },
    {
      title: 'Timeline & loop',
      items: [
        { keys: m('Click marker bar'), description: 'Set paste / play marker' },
        { keys: m('Double-click+drag marker'), description: 'Set loop region' },
        { keys: m('Double-click marker'), description: 'Clear loop region' },
      ],
    },
    {
      title: 'Zoom',
      items: [
        { keys: m('{mod}+wheel'), description: 'Zoom time (horizontal)' },
        { keys: m('{mod}+Shift+wheel'), description: 'Zoom rows (vertical)' },
        { keys: m('Zoom tool + wheel'), description: 'Zoom without modifier' },
      ],
    },
  ];
}
