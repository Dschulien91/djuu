/* Djuu translations. German is the source language: the German text is the key, each language file maps it to its translation.
   Loaded before app.js. A missing translation falls back to German and is collected in I18N_MISSING (for checks).
   The language is fixed per page load: changing it saves the choice and reloads the app.
   New language: add i18n/<code>.js with window.DJUU_I18N.<code> = { 'German text': 'translation', ... } and list it in LANGS. */
'use strict';
window.DJUU_I18N = window.DJUU_I18N || {};
const LANGS = { de: 'Deutsch', en: 'English' };
const LANG = (() => {
  try { const saved = JSON.parse(localStorage.getItem('djuu.v2') || '{}').lang; if (saved && LANGS[saved]) return saved; } catch (e) { /* storage blocked */ }
  // the phone's language: English phones get English, everything else German (Hamburg app)
  return /^en\b/i.test(navigator.language || '') ? 'en' : 'de';
})();
document.documentElement.lang = LANG;
const LOCALE = { de: 'de-DE', en: 'en-GB' }[LANG] || 'de-DE';
const I18N_MISSING = new Set();
// named tl (not t): t is a common local variable name and would hide the function
function tl(text, vars) {
  let out = text;
  if (LANG !== 'de') {
    const dict = window.DJUU_I18N[LANG] || {};
    if (dict[text] != null) out = dict[text]; else I18N_MISSING.add(text);
  }
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : out;
}
// weekday and month names for the chosen language
const I18N_DAYS = { de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }[LANG];
const I18N_DAYS_LONG = { de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'], en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }[LANG];
const I18N_MONTHS_SHORT = { de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }[LANG];
