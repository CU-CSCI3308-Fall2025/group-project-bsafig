// public/js/keyboardShortcuts.js

document.addEventListener('keydown', (event) => {
  // Ignore if any modifier keys are pressed (Ctrl, Cmd, Alt, etc.)
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  // Prevent holding the key from repeatedly firing navigation
  if (event.repeat) return;

  // Figure out what element currently has focus
  const target = event.target || document.activeElement;

  // If the user is typing in an input/textarea/contentEditable, do nothing
  const isTypingField =
    target &&
    (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );

  if (isTypingField) {
    return;
  }

  // Normalize key to lowercase
  const key = event.key.toLowerCase();

  switch (key) {
    case 's':
      // Go to settings
      event.preventDefault();
      window.location.href = '/profile/settings';
      break;

    case 'p':
      // Go to profile
      event.preventDefault();
      window.location.href = '/profile';
      break;

    default:
      break;
  }
});
