// ==UserScript==
// @name         MaM Shoutbox Modern Redesign
// @namespace    https://github.com/KAH-Rhyme/mam-shoutbox-modern-redesign
// @version      1.0.0
// @description  Restyles the MyAnonamouse shoutbox as a clean, modern dark chat view.
// @author       KAH-Rhyme
// @license      MIT
// @homepageURL  https://github.com/KAH-Rhyme/mam-shoutbox-modern-redesign
// @supportURL   https://github.com/KAH-Rhyme/mam-shoutbox-modern-redesign/issues
// @updateURL    https://raw.githubusercontent.com/KAH-Rhyme/mam-shoutbox-modern-redesign/main/mam-shoutbox-modern-redesign.user.js
// @downloadURL  https://raw.githubusercontent.com/KAH-Rhyme/mam-shoutbox-modern-redesign/main/mam-shoutbox-modern-redesign.user.js
// @match        https://www.myanonamouse.net/
// @match        https://www.myanonamouse.net/?*
// @match        https://www.myanonamouse.net/index.php*
// @match        https://www.myanonamouse.net/shoutbox/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings — change these from the ⚙ button at the right of the tab bar.
  // They're saved in this browser (localStorage) and survive page loads.
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    /**
     * Make the message list as tall as the window allows, leaving FILL_MARGIN
     * px above and below the whole shoutbox. Off = MaM's own 250px list.
     */
    fillHeight: true,
    /** After "Load Older", mark where the newly loaded (earlier) shouts end. */
    loadDivider: true,
    /** Show 11:06 instead of 11:06:50 (the full time stays in the tooltip). */
    shortTimestamps: true,
    /** Relabel date breaks as "Today", "Yesterday" or a full date. */
    friendlyDates: true,
    /** Show the country flag in front of each name. */
    showFlags: false,
    /** Show rank / donor icons after each name. */
    showUserIcons: true,
    /** Adjust name colours that would be hard to read (keeps them as close to the original as possible). */
    fixNickContrast: true,
    /**
     * Keep the coloured background some names have (e.g. staff). When off, that
     * colour is used for the name text instead.
     */
    nickBackgrounds: true,
    /** Give every other shout a slightly lighter background. */
    zebraRows: true,
    /**
     * How much lighter the alternate rows are, in % white. Kept between the
     * plain rows (0%) and the hover shade (HOVER_SHADE).
     */
    zebraStrength: 3,
    /** Draw a thin outline around the shout under the mouse. */
    hoverOutline: true,
    /** Show your own username at the start of the message box. */
    showInputNick: true,
    /** Pressing Esc shrinks a maximised (fullscreen) shoutbox back to normal. */
    escRestoresSize: true,
    /**
     * "Mobile view" when the shoutbox is full screen: 'auto' = on touch-screen
     * devices only, 'always', or 'never'.
     */
    mobileView: 'auto',
    /** Width of the right-aligned name column, in px. */
    nickColumnWidth: 130,
    /**
     * Shouts containing any of these words (or replying to them) get a red tint.
     * Your own username is added once automatically (see seedOwnName).
     */
    highlightWords: [],
    /** Internal: whether your username has been added to highlightWords yet. */
    seededOwnName: false,
  };
  const STORAGE_KEY = 'mamsb-settings';

  // Row shades (% white over the background): plain rows 0, alternate rows
  // zebraStrength, hovered rows HOVER_SHADE. The slider stays 1% clear of both.
  const HOVER_SHADE = 7;
  const ZEBRA_MIN = 1;
  const ZEBRA_MAX = HOVER_SHADE - 1;

  const MOBILE_VIEW_CHOICES = ['auto', 'always', 'never'];

  // Name column slider range, px.
  const NICK_WIDTH_MIN = 80;
  const NICK_WIDTH_MAX = 220;

  // "Fill the window height": space left above and below the shoutbox, and the
  // list's minimum height (MaM's own default).
  const FILL_MARGIN = 50;
  const MIN_LIST_HEIGHT = 250;

  // "Load Older": how much of the newly loaded shouts to leave peeking in above
  // the shout you were reading, so it's clear more arrived.
  const LOAD_PEEK = 24;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      // ignore broken / unavailable storage
    }
    const out = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof saved[key] === typeof DEFAULTS[key] && Array.isArray(saved[key]) === Array.isArray(DEFAULTS[key])) {
        out[key] = saved[key];
      }
    }
    out.zebraStrength = clamp(out.zebraStrength, ZEBRA_MIN, ZEBRA_MAX);
    out.nickColumnWidth = clamp(out.nickColumnWidth, NICK_WIDTH_MIN, NICK_WIDTH_MAX);
    if (!MOBILE_VIEW_CHOICES.includes(out.mobileView)) out.mobileView = DEFAULTS.mobileView;
    return out;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // storage full or blocked; settings still apply for this page
    }
  }

  let settings = loadSettings();

  /**
   * Add the logged-in username to the highlight list, once. The flag makes it a
   * one-off, so removing the name later sticks.
   */
  function seedOwnName() {
    if (settings.seededOwnName) return;
    const { name } = currentUser();
    if (!name) return; // not logged in / header not found: try again next load
    const alreadyListed = settings.highlightWords.some((word) => word.toLowerCase() === name.toLowerCase());
    if (!alreadyListed) settings.highlightWords = [name, ...settings.highlightWords];
    settings.seededOwnName = true;
    saveSettings();
  }

  // Theme colours (palette and general UI feel based on https://github.com/tetrahydroc/thchat, MIT, © tetrahydroc and contributors)
  const BG_RGB = [31, 31, 35]; // hsla(240, 6%, 13%) — used for contrast checks

  const CSS = `
#shoutbox.mamsb {
  --sb-bg-primary: hsl(240 6% 13%);
  --sb-bg-secondary: hsl(240 7% 16%);
  --sb-bg-tertiary: hsl(240 6% 23%);
  --sb-text: #e8e8e8;
  --sb-text-secondary: #a0a0a0;
  --sb-text-muted: #8a8a8a;
  --sb-accent: hsl(222 79% 59%);
  --sb-accent-hover: hsl(222 100% 68%);
  --sb-border: hsl(240 5% 26%);
  --sb-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
  --sb-nick-w: 130px;
  --sb-time-w: 38px;
  --sb-btn-w: 26px; /* each of the @ / ↩ / ⋮ hover buttons */
  --sb-actions-w: calc(3 * var(--sb-btn-w) - 2px); /* all three, borders overlapping */

  background: var(--sb-bg-primary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 0 !important;
  padding: 0 !important;
  font-family: var(--sb-font) !important;
  font-size: 14px !important;
}

/* ---- Tabs (Shoutbox / Smilies) ---- */
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav) {
  display: flex !important;
  align-items: stretch;
  gap: 4px;
  margin: 0 !important;
  padding: 0 12px !important;
  background: var(--sb-bg-secondary) !important;
  border: 0 !important;
  border-bottom: 1px solid var(--sb-border) !important;
  border-radius: 0 !important;
}
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav)::before,
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav)::after { display: none !important; }
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav) li {
  list-style: none !important;
  float: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: none !important;
  border: 0 !important;
  top: 0 !important;
}
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav) li a {
  display: block;
  padding: 10px 10px 8px !important;
  color: var(--sb-text-secondary) !important;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none !important;
  border-bottom: 2px solid transparent;
  outline: none;
}
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav) li a:hover { color: var(--sb-text) !important; }
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav) li.ui-tabs-active a {
  color: var(--sb-text) !important;
  border-bottom-color: var(--sb-accent);
}

/* ---- Settings (⚙ at the right of the tab bar) ---- */
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav) li.mamsb-settings {
  position: relative !important;
  display: flex;
  align-items: center;
  margin-left: auto !important;
}
#shoutbox.mamsb .mamsb-settings-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 !important;
  padding: 5px 10px !important;
  background: none !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  color: var(--sb-text-secondary) !important;
  font-family: var(--sb-font) !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1;
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-settings-btn svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  flex-shrink: 0;
}
#shoutbox.mamsb .mamsb-settings-btn:hover,
#shoutbox.mamsb .mamsb-settings-btn.is-open {
  background: var(--sb-bg-tertiary) !important;
  color: var(--sb-text) !important;
}
#shoutbox.mamsb .mamsb-settings-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(560px, calc(100vw - 32px));
  max-height: min(80vh, 640px);
  overflow-y: auto;
  padding: 4px 0 8px;
  background: var(--sb-bg-secondary);
  border: 1px solid var(--sb-border);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  color: var(--sb-text);
  font-family: var(--sb-font);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  white-space: normal; /* MaM's tab bar sets nowrap on everything inside it */
  text-align: left;
  cursor: default;
}
#shoutbox.mamsb .mamsb-settings-panel[hidden] { display: none !important; }
#shoutbox.mamsb .mamsb-settings-title {
  padding: 8px 12px 4px;
  color: var(--sb-text);
  font-size: 13px;
  font-weight: 600;
}
/* Two columns of grouped options; they stack when the panel is narrow */
#shoutbox.mamsb .mamsb-settings-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  column-gap: 4px;
}
#shoutbox.mamsb .mamsb-settings-cols > section { min-width: 0; padding-bottom: 4px; }
#shoutbox.mamsb .mamsb-settings-cols > .mamsb-settings-wide { grid-column: 1 / -1; }
#shoutbox.mamsb .mamsb-settings-heading {
  margin: 0 !important;
  padding: 8px 12px 4px;
  color: var(--sb-text-secondary);
  font-family: var(--sb-font);
  font-size: 11px !important;
  font-weight: 600;
  line-height: 1.4 !important;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
#shoutbox.mamsb .mamsb-settings-panel label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-settings-panel label:hover { background: var(--sb-bg-tertiary); }
#shoutbox.mamsb .mamsb-settings-panel input[type="checkbox"],
#shoutbox.mamsb .mamsb-settings-panel input[type="range"] {
  margin: 0;
  accent-color: var(--sb-accent);
  background: none !important;
  border: 0 !important;
}
#shoutbox.mamsb .mamsb-settings-panel input[type="checkbox"] { width: 14px; height: 14px; flex-shrink: 0; }
#shoutbox.mamsb .mamsb-settings-range input { flex: 1; min-width: 0; }
/* Sub-option, shown only while its parent checkbox is on */
#shoutbox.mamsb .mamsb-settings-panel .mamsb-settings-sub { padding-left: 34px; }
#shoutbox.mamsb .mamsb-settings-range { white-space: nowrap; }
#shoutbox.mamsb .mamsb-settings-panel label[hidden] { display: none !important; }
#shoutbox.mamsb .mamsb-settings-range output {
  min-width: 42px;
  color: var(--sb-text-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
#shoutbox.mamsb .mamsb-settings-panel .mamsb-settings-text {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  cursor: default;
}
#shoutbox.mamsb .mamsb-settings-panel .mamsb-settings-text:hover { background: none; }
#shoutbox.mamsb .mamsb-settings-text input {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px !important;
  background: var(--sb-bg-primary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  font-family: var(--sb-font) !important;
  font-size: 13px !important;
}
#shoutbox.mamsb .mamsb-settings-text input:focus { outline: none; border-color: var(--sb-accent) !important; }
#shoutbox.mamsb .mamsb-settings-panel select {
  margin-left: auto;
  padding: 4px 6px !important;
  background: var(--sb-bg-primary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  font-family: var(--sb-font) !important;
  font-size: 13px !important;
}
#shoutbox.mamsb .mamsb-settings-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
  padding: 8px 12px 0;
  border-top: 1px solid var(--sb-border);
}
#shoutbox.mamsb .mamsb-settings-reset {
  padding: 4px 10px !important;
  background: none !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  color: var(--sb-text-secondary) !important;
  font-family: var(--sb-font) !important;
  font-size: 12px !important;
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-settings-reset:hover {
  color: var(--sb-text) !important;
  border-color: var(--sb-accent) !important;
}

/* ---- Message list ---- */
#shoutbox.mamsb .sbf {
  background: var(--sb-bg-primary) !important;
  color: var(--sb-text) !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  scrollbar-color: var(--sb-border) var(--sb-bg-primary);
  scrollbar-width: thin;
}
/* "Fill the window height": the height is worked out in fitHeight(). Applied
   to both tab panels (shouts and Smilies) so switching tabs keeps the size. */
#shoutbox.mamsb.mamsb-fill > .sbf { height: var(--sb-list-h, 250px) !important; }
#shoutbox.mamsb .sbf::-webkit-scrollbar { width: 8px; }
#shoutbox.mamsb .sbf::-webkit-scrollbar-track { background: var(--sb-bg-primary); }
#shoutbox.mamsb .sbf::-webkit-scrollbar-thumb { background: var(--sb-border); border-radius: 4px; }
#shoutbox.mamsb .sbf::-webkit-scrollbar-thumb:hover { background: var(--sb-text-secondary); }
#shoutbox.mamsb .sbf .blockBodyCon {
  padding: 4px 0 !important;
  background: none !important;
}

/* Load Older */
#shoutbox.mamsb .loadMore {
  display: block;
  margin: 0 0 4px !important;
  padding: 8px 16px !important;
  background: var(--sb-bg-secondary) !important;
  color: var(--sb-text-secondary) !important;
  font-size: 12px !important;
  text-align: center;
  text-decoration: none !important;
  cursor: pointer;
}
#shoutbox.mamsb .loadMore:hover { color: var(--sb-text) !important; }

/* Day divider */
#shoutbox.mamsb .dateBreak {
  display: flex !important;
  align-items: center;
  gap: 12px;
  height: 17px;
  margin: 8px 16px !important;
  padding: 0 !important;
  background: none !important;
  border: 0 !important;
  color: var(--sb-text-secondary) !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  text-align: left !important;
}
#shoutbox.mamsb .dateBreak::before,
#shoutbox.mamsb .dateBreak::after {
  content: "";
  flex: 1;
  border-top: 1px solid var(--sb-border);
}

/* Where "Load Older" put the earlier shouts (everything above this line) */
#shoutbox.mamsb .mamsb-loaded-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 6px 16px;
  color: var(--sb-accent-hover);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
}
#shoutbox.mamsb .mamsb-loaded-divider::before,
#shoutbox.mamsb .mamsb-loaded-divider::after {
  content: "";
  flex: 1;
  border-top: 1px solid var(--sb-accent);
  opacity: 0.6;
}
#shoutbox.mamsb:not(.mamsb-load-divider-on) .mamsb-loaded-divider { display: none; }

/* One shout: time | nick | content, reply line above content */
#shoutbox.mamsb .mamsb-msg {
  display: grid !important;
  grid-template-columns: var(--sb-time-w) var(--sb-nick-w) minmax(0, 1fr);
  column-gap: 8px;
  row-gap: 0;
  align-items: start;
  position: relative;
  margin: 0 !important;
  padding: 4px 16px !important;
  background: none !important;
  border: 0 !important;
  color: var(--sb-text) !important;
  font-size: 14px !important;
  line-height: 1.4 !important;
}
/* Background shades, from lightest effect to strongest:
   plain row → alternate row (--sb-zebra, set from the slider) → hover. Mentions win over all.
   .mamsb-alt is given to every other shout by stripeShouts(); each shout keeps its
   stripe, so shouts arriving or being removed never make the others swap.
   :where() keeps the stripe rule's specificity equal to the hover rule, so hover wins by order. */
#shoutbox.mamsb.mamsb-zebra .mamsb-msg:where(.mamsb-alt) {
  background: rgba(255, 255, 255, var(--sb-zebra, 0.03)) !important;
}
/* Hover effects are for mice; mobile view uses taps instead (.mamsb-tapped).
   :where() keeps these rules' specificity unchanged. */
#shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg:hover { background: rgba(255, 255, 255, var(--sb-hover)) !important; }
/* Optional hover outline. An inset shadow rather than a border, so nothing shifts. */
#shoutbox.mamsb.mamsb-hover-outline:where(:not(.mamsb-mobile)) .mamsb-msg:hover {
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}
#shoutbox.mamsb .mamsb-msg.mamsb-mention { background: rgba(233, 69, 96, 0.1) !important; }
/* Flash on the shout a reply jumped to. Done with an inset shadow because the
   row backgrounds above are !important, which animations can't override. */
#shoutbox.mamsb .mamsb-msg.mamsb-jumped { animation: mamsb-jump 2.2s ease-out; }
@keyframes mamsb-jump {
  0%, 25% { box-shadow: inset 0 0 0 9999px rgba(99, 102, 241, 0.35), inset 3px 0 0 var(--sb-accent); }
  100% { box-shadow: inset 0 0 0 9999px rgba(99, 102, 241, 0), inset 3px 0 0 transparent; }
}

#shoutbox.mamsb .mamsb-msg > .ts {
  grid-area: 2 / 1;
  color: var(--sb-text-secondary) !important;
  font-size: 12px !important;
  line-height: 19.6px; /* matches the 14px × 1.4 text rows */
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  margin: 0 !important;
  padding: 0 !important;
}

#shoutbox.mamsb .mamsb-msg > .mamsb-nick {
  grid-area: 2 / 2;
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-align: right;
  padding-right: 10px;
  mask-image: linear-gradient(270deg, #0000, #000 10px);
  -webkit-mask-image: linear-gradient(270deg, #0000, #000 10px);
  text-decoration: none !important;
}
/* Names everywhere (shout, @mention, reply line): MaM makes some bold italic */
#shoutbox.mamsb .mamsb-nick > span,
#shoutbox.mamsb .mamsb-body a[href^="/u/"] > span,
#shoutbox.mamsb .mamsb-reply > a > span {
  font-weight: 500 !important;
  font-style: normal !important;
}
#shoutbox.mamsb .mamsb-nick:hover > span { text-decoration: underline; }
#shoutbox.mamsb .mamsb-nick img {
  height: 14px !important;
  width: auto !important;
  vertical-align: -2px;
  margin: 0 0 0 3px !important;
}
#shoutbox.mamsb .mamsb-nick img.sb_country {
  height: 11px !important;
  margin: 0 4px 0 0 !important;
  vertical-align: 0;
}
/* Names with their own background colour (e.g. staff): a small tag shape */
#shoutbox.mamsb span.mamsb-nick-bg {
  padding: 0 4px;
  border-radius: 3px;
}
#shoutbox.mamsb.mamsb-hide-flags .sb_country,
#shoutbox.mamsb.mamsb-hide-icons .mamsb-nick > img { display: none !important; }

#shoutbox.mamsb .mamsb-body {
  grid-area: 2 / 3;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--sb-text);
}
/* Keep the first line clear of the @ / ↩ / ⋮ hover buttons (76px wide, at the
   top right). A thin float only shortens the first line; later lines use the
   full width. */
#shoutbox.mamsb .mamsb-body::before {
  content: "";
  float: right;
  width: var(--sb-actions-w);
  height: 1px;
}
#shoutbox.mamsb .mamsb-body a { text-decoration: none !important; }
#shoutbox.mamsb .mamsb-body a:not([href^="/u/"]) { color: var(--sb-accent) !important; }
#shoutbox.mamsb .mamsb-body a:hover { text-decoration: underline !important; }
#shoutbox.mamsb .mamsb-body img { vertical-align: middle; }
#shoutbox.mamsb .mamsb-hide,
#shoutbox.mamsb .mamsb-reply > img.sbQuote { display: none !important; }

/* Edited shouts: MaM marks these by giving the ⋮ a green background */
#shoutbox.mamsb .mamsb-msg:has(> .sb_menu[data-et]:not([data-et="0"])) > .mamsb-body::after {
  content: "(edited)";
  margin-left: 6px;
  color: var(--sb-text-muted);
  font-size: 11px;
  font-style: normal;
}

/* /me actions: "*" in the name column, "name does thing" in the content */
#shoutbox.mamsb .mamsb-msg.action::before {
  content: "*";
  grid-area: 2 / 2;
  padding-right: 10px;
  text-align: right;
  font-weight: 600;
  color: rgb(216, 185, 127);
}
#shoutbox.mamsb .mamsb-msg.action > .mamsb-body {
  color: rgb(216, 185, 127) !important;
  font-style: italic;
}
#shoutbox.mamsb .mamsb-body > .mamsb-nick { text-decoration: none !important; }

/* Reply line (from MaM's inline quote) */
#shoutbox.mamsb .mamsb-reply {
  grid-area: 1 / 3;
  padding-right: var(--sb-actions-w);
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--sb-text-secondary);
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-reply::before {
  content: "↩";
  font-size: 11px;
  flex-shrink: 0;
}
#shoutbox.mamsb .mamsb-reply > a {
  flex-shrink: 0;
  text-decoration: none !important;
}
#shoutbox.mamsb .mamsb-reply > a:hover > span { text-decoration: underline; }
#shoutbox.mamsb .mamsb-reply > i {
  font-style: normal;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
#shoutbox.mamsb .mamsb-reply:hover > i,
#shoutbox.mamsb .mamsb-reply:focus-visible > i {
  color: var(--sb-text);
  text-decoration: underline;
}
#shoutbox.mamsb .mamsb-reply:focus-visible {
  outline: 1px solid var(--sb-accent);
  outline-offset: 1px;
  border-radius: 2px;
}
/* Shown briefly when the quoted shout is older than what's loaded */
#shoutbox.mamsb .mamsb-reply.mamsb-reply-missing::after {
  content: "not loaded, try Load Older";
  flex-shrink: 0;
  color: var(--sb-text-muted);
  font-style: italic;
}

/* Hover actions: @mention · quote · menu, joined like a small toolbar */
#shoutbox.mamsb .mamsb-msg > .sbAt,
#shoutbox.mamsb .mamsb-msg > .sbNewQuote,
#shoutbox.mamsb .mamsb-msg > .sb_menu {
  position: absolute !important;
  top: 2px;
  z-index: 2;
  box-sizing: border-box;
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: var(--sb-btn-w);
  height: 22px;
  margin: 0 !important;
  padding: 0 !important;
  background: var(--sb-bg-tertiary) !important;
  border: 1px solid var(--sb-border) !important;
  color: var(--sb-text-secondary) !important;
  font-size: 0 !important;
  text-decoration: none !important;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s ease;
}
/* Side by side from the right, each overlapping the previous one's border */
#shoutbox.mamsb .mamsb-msg > .sb_menu { right: 12px; border-radius: 0 4px 4px 0; }
#shoutbox.mamsb .mamsb-msg > .sbNewQuote { right: calc(12px + var(--sb-btn-w) - 1px); border-radius: 0; }
#shoutbox.mamsb .mamsb-msg > .sbAt { right: calc(12px + 2 * (var(--sb-btn-w) - 1px)); border-radius: 4px 0 0 4px; }
#shoutbox.mamsb .mamsb-msg > .sbAt::before { content: "@"; font-size: 13px; }
#shoutbox.mamsb .mamsb-msg > .sbNewQuote::before { content: "↩"; font-size: 13px; }
#shoutbox.mamsb .mamsb-msg > .sb_menu svg {
  width: 4px !important;
  height: 13px !important;
  fill: currentColor;
}
@media (hover: hover) {
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg:hover > .sbAt,
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg:hover > .sbNewQuote,
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg:hover > .sb_menu {
    opacity: 1;
    pointer-events: auto;
  }
}
/* Without a mouse, tap a shout to show its buttons (as in mobile view). */
@media (hover: none) {
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg.mamsb-tapped {
    background: rgba(255, 255, 255, var(--sb-hover)) !important;
  }
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg.mamsb-tapped > .sbAt,
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg.mamsb-tapped > .sbNewQuote,
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg.mamsb-tapped > .sb_menu {
    opacity: 1;
    pointer-events: auto;
  }
}
#shoutbox.mamsb .mamsb-msg > .sbAt:hover,
#shoutbox.mamsb .mamsb-msg > .sbNewQuote:hover,
#shoutbox.mamsb .mamsb-msg > .sb_menu:hover {
  color: var(--sb-text) !important;
}

/* ---- Composer ---- */
#shoutbox.mamsb #sbform {
  display: flex !important;
  align-items: stretch;
  margin: 0 !important;
  padding: 12px 16px !important;
  background: var(--sb-bg-secondary) !important;
  border: 0 !important;
  border-top: 1px solid var(--sb-border) !important;
}
/* MaM's "Text and Smilies Entry: top" puts the message box above the list:
   then its separator line belongs underneath */
#shoutbox.mamsb > #sbform:has(~ .sbf) {
  border-top: 0 !important;
  border-bottom: 1px solid var(--sb-border) !important;
}
#shoutbox.mamsb #shbox_text {
  flex: 1;
  min-width: 0;
  width: auto !important;
  height: auto !important;
  margin: 0 !important;
  padding: 10px 14px !important;
  background: var(--sb-bg-primary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px 0 0 4px !important;
  box-shadow: none !important;
  outline: none !important;
  font-family: var(--sb-font) !important;
  font-size: 14px !important;
  line-height: 1.4 !important;
}
#shoutbox.mamsb #shbox_text::placeholder { color: var(--sb-text-muted); }
#shoutbox.mamsb #shbox_text:focus { border-color: var(--sb-accent) !important; }

/* Your name at the start of the message box; shares the box's border */
#shoutbox.mamsb .mamsb-input-nick { display: none; }
#shoutbox.mamsb.mamsb-input-nick-on .mamsb-input-nick {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 160px;
  padding: 0 2px 0 14px;
  background: var(--sb-bg-primary);
  border: 1px solid var(--sb-border);
  border-right: 0;
  border-radius: 4px 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}
#shoutbox.mamsb.mamsb-input-nick-on .mamsb-input-nick + #shbox_text {
  padding-left: 8px !important;
  border-left: 0 !important;
  border-radius: 0 !important;
}
#shoutbox.mamsb.mamsb-input-nick-on #sbform:has(#shbox_text:focus) .mamsb-input-nick {
  border-color: var(--sb-accent);
}
#shoutbox.mamsb #shout_send {
  margin: 0 !important;
  padding: 10px 14px !important;
  background: none !important;
  color: var(--sb-text-muted) !important;
  border: 1px solid var(--sb-border) !important;
  border-left: none !important;
  border-radius: 0 4px 4px 0 !important;
  box-shadow: none !important;
  font-family: var(--sb-font) !important;
  font-size: 14px !important;
  line-height: 1 !important;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
#shoutbox.mamsb #shout_send:hover {
  color: var(--sb-accent) !important;
  border-color: var(--sb-accent) !important;
}
#shoutbox.mamsb #sbFullToggle {
  align-self: center;
  height: 18px !important;
  margin: 0 0 0 12px !important;
  filter: invert(1);
  opacity: 0.55;
  cursor: pointer;
}
#shoutbox.mamsb #sbFullToggle:hover { opacity: 0.9; }

/* MaM's black rounded footer bar under the block */
#fpShout:has(> #shoutbox.mamsb) > .blockFoot { display: none !important; }

/* ---- Smilies tab ---- */
#shoutbox.mamsb #smilies .blockBodyCon { padding: 8px 12px !important; }
#shoutbox.mamsb #smilies img {
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
}
#shoutbox.mamsb #smilies img:hover { background: var(--sb-bg-tertiary); }

/* ---- MaM popovers: shout menu and edit dialog ----
   #sbMenuMain and #sbEditOverlay are transparent layers stretched over the
   whole shoutbox, so leave their own background alone and only style what's
   inside them. */
#shoutbox.mamsb #sbMenuMain {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}
/* The menu box itself — positioned beside the ⋮ button by positionMenu() */
#shoutbox.mamsb #sbMenuMain > ul {
  z-index: 1000;
  box-sizing: border-box !important;
  overflow: hidden !important;
  min-width: 160px;
  max-width: 280px;
  margin: 0 !important;
  padding: 4px 0 !important;
  list-style: none !important;
  background: var(--sb-bg-secondary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
  font-family: var(--sb-font) !important;
  font-size: 13px !important;
  line-height: 1.4;
}
#shoutbox.mamsb #sbMenuMain > ul > li {
  display: flex !important;
  align-items: center;
  gap: 8px;
  box-sizing: border-box !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  float: none !important;
  position: static !important;
  margin: 0 !important;
  padding: 8px 12px !important;
  background: none !important;
  white-space: nowrap;
}
/* "quote" action */
#shoutbox.mamsb #sbMenuMain #sbQuote {
  cursor: pointer;
  text-transform: capitalize;
}
#shoutbox.mamsb #sbMenuMain #sbQuote:hover { background: var(--sb-bg-tertiary) !important; }
#shoutbox.mamsb #sbMenuMain #sbQuote > img { display: none; }
#shoutbox.mamsb #sbMenuMain #sbQuote::before { content: "↩"; color: var(--sb-text-secondary); }
/* User row: name, rank icon, PM link */
#shoutbox.mamsb #sbMenuMain #sbun {
  gap: 4px;
  border-top: 1px solid var(--sb-border);
  margin-top: 4px !important;
  padding-top: 10px !important;
  font-weight: 500;
}
#shoutbox.mamsb #sbMenuMain #sbun img { height: 14px !important; width: auto; }
#shoutbox.mamsb #sbMenuMain #sbun > a {
  margin-left: auto;
  padding: 2px 4px;
  border-radius: 4px;
  opacity: 0.75;
}
#shoutbox.mamsb #sbMenuMain #sbun > a:hover { opacity: 1; background: var(--sb-bg-tertiary); }
/* Rank (last row) */
#shoutbox.mamsb #sbMenuMain > ul > li:last-child:not(#sbun):not(#sbQuote) {
  padding-top: 0 !important;
  color: var(--sb-text-secondary);
  font-size: 12px;
}
#shoutbox.mamsb #sbMenuMain a { color: var(--sb-text) !important; }
#shoutbox.mamsb #sbMenuMain a:hover { color: var(--sb-accent-hover) !important; }
#shoutbox.mamsb #sbEditOverlay > form {
  padding: 16px;
  background: var(--sb-bg-secondary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border);
  border-radius: 6px;
  box-shadow: 0 10px 15px rgba(0, 0, 0, 0.4);
}
#shoutbox.mamsb #sbEditOverlay textarea {
  background: var(--sb-bg-primary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  font-family: var(--sb-font);
}
#shoutbox.mamsb #sbEditOverlay input[type="button"] {
  padding: 6px 14px;
  background: var(--sb-bg-tertiary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  cursor: pointer;
}
#shoutbox.mamsb #sbEditOverlay #sbEditSubmit {
  background: var(--sb-accent) !important;
  border-color: var(--sb-accent) !important;
  color: #fff !important;
}
/* Shown if a safety net stopped something that kept repeating (see LoopGuard) */
#shoutbox.mamsb .mamsb-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(251, 191, 36, 0.12);
  border-bottom: 1px solid rgba(251, 191, 36, 0.4);
  color: #fbbf24;
  font-size: 12px;
  line-height: 1.4;
}
#shoutbox.mamsb .mamsb-notice button {
  margin-left: auto !important;
  padding: 0 6px !important;
  background: none !important;
  border: 0 !important;
  color: inherit !important;
  font-size: 16px !important;
  cursor: pointer;
}

/* "Copy diagnostics" report: its own layer on top of everything */
#mamsb-diagnostics {
  position: fixed !important;
  inset: 8px !important;
  z-index: 2147483000 !important;
  display: flex !important;
  flex-direction: column;
  gap: 8px;
  padding: 12px !important;
  background: #1f1f23 !important;
  color: #e8e8e8 !important;
  border: 1px solid #555 !important;
  border-radius: 6px !important;
  font: 14px/1.4 sans-serif !important;
}
#mamsb-diagnostics textarea {
  flex: 1;
  width: 100% !important;
  box-sizing: border-box;
  background: #111 !important;
  color: #ddd !important;
  font: 11px/1.3 monospace !important;
}
#mamsb-diagnostics div { display: flex; gap: 8px; justify-content: flex-end; }
#mamsb-diagnostics button { padding: 8px 14px !important; font-size: 14px !important; }

/* =========================================================================
   Mobile view: touch-friendly layout, only while the shoutbox is full screen
   ========================================================================= */

/* Entry button next to MaM's ⛶, on touch devices (and "Always") */
#shoutbox.mamsb .mamsb-mobile-btn { display: none; }
#shoutbox.mamsb.mamsb-touch:not(.mamsb-mobile) .mamsb-mobile-btn {
  display: inline-flex;
  align-items: center;
  align-self: center;
  margin: 0 0 0 12px !important;
  padding: 8px 14px !important;
  background: none !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  color: var(--sb-text) !important;
  font-family: var(--sb-font) !important;
  font-size: 18px !important; /* the normal page is zoomed out on phones */
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
#shoutbox.mamsb.mamsb-touch:not(.mamsb-mobile) .mamsb-mobile-btn + #sbFullToggle { margin-left: 8px !important; }

/* Exit button in the tab bar, only in mobile view */
#shoutbox.mamsb > :is(#sbMenuTabs, .ui-tabs-nav) li.mamsb-exit { display: none; }
#shoutbox.mamsb.mamsb-mobile > :is(#sbMenuTabs, .ui-tabs-nav) li.mamsb-exit {
  display: flex;
  align-items: center;
  margin-left: 8px !important;
}
#shoutbox.mamsb .mamsb-exit-btn {
  margin: 0 !important;
  padding: 8px 12px !important;
  background: none !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  color: var(--sb-text) !important;
  font-family: var(--sb-font) !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  line-height: 1;
  cursor: pointer;
}

/* Lock the page behind the full-screen shoutbox */
html.mamsb-mobile-open,
html.mamsb-mobile-open body { overflow: hidden !important; }

/* Firefox for Android enlarges text on pages it thinks weren't made for
   phones ("font inflation"), and MaM's page loaded as one. Our sizes are
   already phone-sized, so switch that off. */
html.mamsb-mobile-open,
html.mamsb-mobile-open body,
#shoutbox.mamsb.mamsb-mobile {
  -moz-text-size-adjust: none !important;
  -webkit-text-size-adjust: none !important;
  text-size-adjust: none !important;
}

/* The tap buttons: always at the top right of the shout, 40×32 */
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sb_menu,
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbNewQuote,
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbAt {
  top: 8px !important;
  bottom: auto !important;
  left: auto !important;
  width: var(--sb-btn-w) !important;
  height: 32px !important;
  align-content: normal !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sb_menu {
  right: 12px !important;
  border-radius: 0 4px 4px 0 !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbNewQuote {
  right: calc(12px + var(--sb-btn-w) - 1px) !important;
  border-radius: 0 !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbAt {
  right: calc(12px + 2 * (var(--sb-btn-w) - 1px)) !important;
  border-radius: 4px 0 0 4px !important;
}
/* The ⋮ menu: normal text sizes, and nothing behind the name */
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul { font-size: 15px !important; margin: 0 !important; }
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul * {
  font-size: inherit !important;
  line-height: 1.4 !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul > li:last-child:not(#sbun):not(#sbQuote) { font-size: 13px !important; }
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain #sbun > span {
  display: inline !important;
  padding: 0 !important;
  margin: 0 !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain #sbun > span:not([style*="background"]) { background: none !important; }
/* Text sizes in the tab bar and message box */
#shoutbox#shoutbox.mamsb.mamsb-mobile > :is(#sbMenuTabs, .ui-tabs-nav),
#shoutbox#shoutbox.mamsb.mamsb-mobile > #sbform { font-size: 14px !important; }
#shoutbox#shoutbox.mamsb.mamsb-mobile.mamsb-input-nick-on .mamsb-input-nick { font-size: 15px !important; }

/* Other stylesheets (e.g. custom CSS saved in a MaM account) can restyle the
   full-screen shoutbox and break mobile view. These pins lock down its
   essentials: they use the shoutbox's ID twice, which outranks anything a
   normal stylesheet can do, plus !important. Custom CSS isn't otherwise
   supported. */
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg {
  width: auto !important;
  margin: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg img {
  min-width: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-nick img {
  width: auto !important;
  height: 16px !important;
  max-width: none !important;
  max-height: 16px !important;
  margin: 0 0 0 3px !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-nick img.sb_country {
  height: 12px !important;
  max-height: 12px !important;
  margin: 0 4px 0 0 !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-body img { max-height: 48px !important; width: auto !important; }
/* Links in shouts: plain text, no button styling */
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg a {
  display: inline !important;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: none !important;
  box-shadow: none !important;
  text-transform: none !important;
  letter-spacing: normal !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > a.mamsb-nick { display: block !important; }
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbAt,
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbNewQuote {
  display: flex !important;
  border: 1px solid var(--sb-border) !important;
  background: var(--sb-bg-tertiary) !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile .loadMore {
  display: block !important;
  margin: 0 0 4px !important;
  padding: 10px 16px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: var(--sb-bg-secondary) !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  font-size: 13px !important;
}
/* Tab bar: tabs at their natural size, Settings and Exit on the right */
#shoutbox#shoutbox.mamsb.mamsb-mobile > :is(#sbMenuTabs, .ui-tabs-nav) {
  display: flex !important;
  flex-wrap: nowrap !important;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile > :is(#sbMenuTabs, .ui-tabs-nav) > li {
  display: flex !important;
  flex: none !important;
  width: auto !important;
  min-width: 0 !important;
  height: auto !important;
  position: relative !important;
  visibility: visible !important;
  opacity: 1 !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile > :is(#sbMenuTabs, .ui-tabs-nav) > li.mamsb-settings { margin-left: auto !important; }
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-settings-btn,
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-exit-btn {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  width: auto !important;
  height: auto !important;
}
/* Message box: your name, the input, then Shout, in that order */
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbform {
  display: flex !important;
  flex-wrap: nowrap !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbform > * { order: 0 !important; float: none !important; }
#shoutbox#shoutbox.mamsb.mamsb-mobile #shbox_text {
  display: block !important;
  flex: 1 1 auto !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
}
#shoutbox#shoutbox.mamsb.mamsb-mobile #shout_send { flex: none !important; width: auto !important; }

/* The shoutbox fills exactly what you can see: the visual viewport, which
   shrinks when the on-screen keyboard opens (see fitToVisibleArea). */
#shoutbox.mamsb.mamsb-mobile {
  --sb-btn-w: 40px;
  position: fixed !important;
  inset: auto !important;
  top: var(--sb-vv-top, 0px) !important;
  left: var(--sb-vv-left, 0px) !important;
  width: var(--sb-vv-w, 100vw) !important;
  height: var(--sb-vv-h, 100vh) !important;
  max-width: none !important;
  margin: 0 !important;
  box-sizing: border-box;
  display: flex !important;
  flex-direction: column;
  border: 0 !important;
  z-index: 100000 !important; /* above everything else on MaM's page */
}
/* MaM's username/smiley autocomplete lists hang off <body>, so lift them
   above the full-screen shoutbox or the suggestions would be hidden behind it. */
html.mamsb-mobile-open body > .ui-autocomplete {
  z-index: 100001 !important;
}
/* "Zoomed in · Reset zoom": shown after you pinch-zoom in mobile view. It sits
   just above the message box; zoomPill.place() scales it back to normal size. */
#shoutbox.mamsb .mamsb-zoom-pill { display: none; }
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-zoom-pill:not([hidden]) {
  position: absolute !important;
  left: 50% !important;
  z-index: 5 !important;
  display: flex !important;
  align-items: center;
  gap: 8px;
  margin: 0 !important;
  padding: 6px 6px 6px 14px !important;
  background: var(--sb-bg-tertiary) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 999px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  color: var(--sb-text) !important;
  font-family: var(--sb-font) !important;
  font-size: 14px !important;
  line-height: 1.2 !important;
  white-space: nowrap;
  transform-origin: bottom center;
}
#shoutbox.mamsb .mamsb-zoom-pill button {
  margin: 0 !important;
  padding: 6px 12px !important;
  border: 0 !important;
  border-radius: 999px !important;
  font-family: var(--sb-font) !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-zoom-pill .mamsb-zoom-reset { background: var(--sb-accent) !important; color: #fff !important; }
#shoutbox.mamsb .mamsb-zoom-pill .mamsb-zoom-reset[hidden] { display: none !important; }
#shoutbox.mamsb .mamsb-zoom-pill .mamsb-zoom-close {
  padding: 6px 8px !important;
  background: none !important;
  color: var(--sb-text-secondary) !important;
  font-size: 18px !important;
}
/* Tab bar at the top, message box at the bottom, the list fills the rest.
   This replaces MaM's own fixed heights. */
#shoutbox.mamsb.mamsb-mobile > :is(#sbMenuTabs, .ui-tabs-nav),
#shoutbox.mamsb.mamsb-mobile > #sbform,
#shoutbox.mamsb.mamsb-mobile > #sbNotifs { flex: none; }
#shoutbox.mamsb.mamsb-mobile > .sbf {
  flex: 1 1 auto;
  height: auto !important;
  min-height: 0;
  overscroll-behavior: contain;
}
#shoutbox.mamsb.mamsb-mobile > :is(#sbMenuTabs, .ui-tabs-nav) li a { padding: 12px 10px 10px !important; font-size: 14px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-btn { padding: 8px 12px !important; font-size: 14px !important; }

/* Shouts: name and time on one line, message underneath at full width */
#shoutbox.mamsb.mamsb-mobile .mamsb-msg {
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: minmax(32px, auto); /* the name line is as tall as the tap buttons */
  padding: 8px 12px !important;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .mamsb-nick { align-self: center; }
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .mamsb-nick {
  grid-area: 1 / 1;
  max-width: 70vw;
  padding-right: 0;
  text-align: left;
  mask-image: none;
  -webkit-mask-image: none;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.action::before {
  grid-area: 1 / 1;
  padding-right: 0;
  text-align: left;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .ts {
  grid-area: 1 / 2;
  align-self: center;
  line-height: normal;
  cursor: pointer;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-reply {
  grid-area: 2 / 1 / 3 / 3;
  min-height: 26px;
  padding-right: 0;
  font-size: 13px;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-body {
  grid-area: 3 / 1 / 4 / 3;
  font-size: 15px;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-body::before { display: none; } /* no hover buttons to keep clear of */

/* Tap a shout to show its @ / ↩ / ⋮ buttons (larger, for fingers) */
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.mamsb-tapped { background: rgba(255, 255, 255, var(--sb-hover)) !important; }
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbAt,
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbNewQuote,
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sb_menu {
  top: 8px; /* level with the name line */
  height: 32px;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.mamsb-tapped > .sbAt,
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.mamsb-tapped > .sbNewQuote,
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.mamsb-tapped > .sb_menu {
  opacity: 1;
  pointer-events: auto;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbAt::before,
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sbNewQuote::before { font-size: 17px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sb_menu svg { width: 5px !important; height: 17px !important; }
#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul > li { padding: 12px 16px !important; font-size: 15px; }

/* Message box: 16px text stops iPhones zooming in when you tap it */
#shoutbox.mamsb.mamsb-mobile #sbform { padding: 8px !important; }
#shoutbox.mamsb.mamsb-mobile #shbox_text { font-size: 16px !important; }
#shoutbox.mamsb.mamsb-mobile.mamsb-input-nick-on .mamsb-input-nick { max-width: 30vw; padding-left: 10px; font-size: 15px; }
#shoutbox.mamsb.mamsb-mobile #sbFullToggle,
#shoutbox.mamsb.mamsb-mobile .mamsb-mobile-btn { display: none !important; } /* use ✕ Exit instead */

/* Settings: a full-screen sheet, without the options that don't apply here */
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-panel {
  position: fixed;
  top: var(--sb-vv-top, 0px);
  left: var(--sb-vv-left, 0px);
  width: var(--sb-vv-w, 100vw);
  height: var(--sb-vv-h, 100vh);
  max-height: none;
  padding-bottom: 16px;
  border: 0;
  border-radius: 0;
  z-index: 1002;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-title { padding: 14px 16px 6px; font-size: 16px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-heading { padding: 12px 16px 4px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-panel label { padding: 10px 16px; font-size: 15px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-panel input[type="checkbox"] { width: 20px; height: 20px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-panel [data-desktop-only] { display: none !important; }
#shoutbox.mamsb .mamsb-settings-done { display: none; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-foot { justify-content: space-between; padding: 12px 16px 0; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-done,
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-reset { padding: 10px 16px !important; font-size: 15px !important; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-done {
  display: block;
  background: var(--sb-accent) !important;
  border: 1px solid var(--sb-accent) !important;
  border-radius: 4px;
  color: #fff !important;
  font-family: var(--sb-font) !important;
  font-weight: 600;
  cursor: pointer;
}
`;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const SHOUT_SELECTOR = 'div[id^="sbid"]';
  const SHOUT_ID = /^sbid\d+$/;

  // Within this many px of the newest end counts as "reading the newest shouts".
  const AT_BOTTOM_SLACK = 8;

  function isTextNode(node) {
    return node?.nodeType === Node.TEXT_NODE;
  }

  function isElementMatching(node, selector) {
    return node?.nodeType === Node.ELEMENT_NODE && node.matches(selector);
  }

  function isProfileLink(node) {
    return isElementMatching(node, 'a') && /^\/u\/\d+/.test(node.getAttribute('href') || '');
  }

  /**
   * The Shoutbox / Smilies tab bar. Found by its ID: the .ui-tabs-nav class is
   * only added once MaM's tab code has run, and on slower devices (phones) this
   * script can start before that.
   */
  function findTabBar(root) {
    return root.querySelector(':scope > #sbMenuTabs, :scope > .ui-tabs-nav');
  }

  /** Hide a node without removing it (MaM's own code may still read its text). */
  function wrapHidden(node) {
    const span = document.createElement('span');
    span.className = 'mamsb-hide';
    node.replaceWith(span);
    span.append(node);
    return span;
  }

  /**
   * MaM's "Shoutbox Order" setting: oldest at the top (the default) or newest
   * at the top. In the second case new shouts arrive at the top, and Load
   * Older adds older ones at the bottom.
   */
  function newestFirst() {
    return document.getElementById('sbfOrder')?.value === 'prepend';
  }

  /** The newest shout in the list, whichever way round it's ordered. */
  function newestShout(root) {
    const shouts = root.querySelectorAll('#sbf .mamsb-msg');
    return newestFirst() ? shouts[0] : shouts[shouts.length - 1];
  }

  /** Scroll the list to its newest shouts (the bottom, or the top if newest-first). */
  function scrollToNewest(list) {
    list.scrollTop = newestFirst() ? 0 : list.scrollHeight;
  }

  /** Run `change` (which alters the list's size) without losing your place at the newest shouts. */
  function keepingNewestInView(list, change) {
    if (!list.getClientRects().length) {
      change(); // hidden (other tab): nothing to keep in view
      return;
    }
    const wasAtNewest = newestFirst()
      ? list.scrollTop < AT_BOTTOM_SLACK
      : list.scrollHeight - list.scrollTop - list.clientHeight < AT_BOTTOM_SLACK;
    change();
    if (wasAtNewest) scrollToNewest(list);
  }

  // ---------------------------------------------------------------------------
  // Safety net against runaway loops
  // ---------------------------------------------------------------------------
  // Some features react to changes that they can cause themselves (e.g. sizing
  // the shoutbox changes its size). That should settle straight away, but if a
  // browser keeps nudging the numbers it could repeat forever and freeze the
  // page. A LoopGuard counts how often something runs; past a limit it trips,
  // the feature stops, and a notice says which one, so it can be reported.
  const LOOP_WINDOW_MS = 1000;

  class LoopGuard {
    constructor(name, limitPerSecond, onTrip) {
      this.name = name;
      this.limit = limitPerSecond;
      this.onTrip = onTrip;
      this.times = [];
      this.tripped = false;
    }

    /** Record one run. Returns false once the guard has tripped. */
    allow() {
      if (this.tripped) return false;
      const now = performance.now();
      this.times.push(now);
      while (this.times.length && now - this.times[0] > LOOP_WINDOW_MS) this.times.shift();
      if (this.times.length > this.limit) {
        this.tripped = true;
        this.onTrip();
        return false;
      }
      return true;
    }
  }

  /** A small dismissable notice at the top of the shoutbox. */
  function showNotice(root, text) {
    console.warn(`[MaM Shoutbox Modern Redesign] ${text}`);
    const notice = document.createElement('div');
    notice.className = 'mamsb-notice';
    notice.setAttribute('role', 'status');
    const message = document.createElement('span');
    message.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Dismiss';
    close.addEventListener('click', () => notice.remove());
    notice.append(message, close);
    const nav = findTabBar(root);
    if (nav) nav.after(notice);
    else root.prepend(notice);
  }

  // ---------------------------------------------------------------------------
  // Colours
  // ---------------------------------------------------------------------------
  const DEFAULT_TEXT_RGB = [232, 232, 232];
  const MIN_CONTRAST = 4.5; // WCAG AA for normal text

  /** "rgb(1, 2, 3)" / "rgba(...)" → [1, 2, 3], or null. */
  function parseRgb(text) {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(text || '');
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  /** Relative luminance, as defined by WCAG. */
  function luminance([r, g, b]) {
    const linear = [r, g, b].map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrastRatio(rgbA, rgbB) {
    const lighter = Math.max(luminance(rgbA), luminance(rgbB));
    const darker = Math.min(luminance(rgbA), luminance(rgbB));
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Nudge a text colour until it's readable on `background`: toward white on
   * dark backgrounds, toward black on light ones, in small steps so it stays as
   * close to the original as possible. Returns null if it's already readable.
   */
  function readableColour(rgb, background = BG_RGB) {
    if (contrastRatio(rgb, background) >= MIN_CONTRAST) return null;
    const target = luminance(background) < 0.18 ? 255 : 0;
    for (let step = 1; step <= 20; step++) {
      const amount = step / 20;
      const mixed = rgb.map((channel) => Math.round(channel + (target - channel) * amount));
      if (contrastRatio(mixed, background) >= MIN_CONTRAST) return mixed;
    }
    return [target, target, target];
  }

  /**
   * Apply the colour settings to one coloured name. The original colours are
   * kept in data-mamsb-color / data-mamsb-bg so every setting can be undone.
   */
  function applyColour(span) {
    const data = span.dataset;
    if (!('mamsbColor' in data)) data.mamsbColor = span.style.color;
    if (!('mamsbBg' in data)) data.mamsbBg = span.style.backgroundColor;

    const originalBackground = parseRgb(data.mamsbBg);
    let color = data.mamsbColor;
    let background = data.mamsbBg;
    if (originalBackground && !settings.nickBackgrounds) {
      // Drop the highlight and let its colour carry the name instead.
      background = '';
      color = data.mamsbBg;
    }

    if (settings.fixNickContrast) {
      const shownBackground = background ? originalBackground : BG_RGB;
      const textRgb = parseRgb(color) || (background ? DEFAULT_TEXT_RGB : null);
      const fixed = textRgb && readableColour(textRgb, shownBackground);
      if (fixed) color = `rgb(${fixed.join(', ')})`;
    }

    if (span.style.color !== color) span.style.color = color;
    if (span.style.backgroundColor !== background) span.style.backgroundColor = background;
    span.classList.toggle('mamsb-nick-bg', Boolean(background));
  }

  function applyColours(scope) {
    scope.querySelectorAll('span[style*="color"], span[data-mamsb-color]').forEach(applyColour);
  }

  // ---------------------------------------------------------------------------
  // Times and dates
  // ---------------------------------------------------------------------------
  /** Show HH:MM or HH:MM:SS. The original is kept in data-mamsb-ts. */
  function applyTime(timeEl) {
    if (!timeEl.dataset.mamsbTs) timeEl.dataset.mamsbTs = timeEl.textContent.trim();
    const full = timeEl.dataset.mamsbTs;
    const withoutSeconds = full.match(/^(\d{1,2}:\d{2}):\d{2}$/)?.[1];
    const text = settings.shortTimestamps && withoutSeconds ? withoutSeconds : full;
    if (timeEl.textContent !== text) timeEl.textContent = text;
  }

  // MaM shows dates and times in its own timezone (UTC unless changed in your
  // MaM preferences), which may not be your computer's. So "today" has to be
  // MaM's today. We learn the difference from shouts arriving live (they're
  // always "now"); until then, the newest shout's date stands in for today,
  // which in a busy shoutbox is nearly always right.
  const DAY_MS = 86400000;
  const QUARTER_HOUR_MS = 15 * 60 * 1000; // timezones are whole quarter hours
  let mamClockOffsetMs = null; // MaM's displayed time minus the real time

  /** "2026-11-06 14:39:54" → that wall-clock time, as if it were UTC (ms). */
  function parseMamTime(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text || '');
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) : null;
  }

  /** Learn MaM's clock from a shout that has just arrived. Returns true if it changed. */
  function learnMamClock(timeEl) {
    const shown = parseMamTime(timeEl?.title);
    if (shown === null) return false;
    const offset = Math.round((shown - Date.now()) / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
    if (offset === mamClockOffsetMs) return false;
    mamClockOffsetMs = offset;
    return true;
  }

  /** Today's date on MaM's clock, as YYYY-MM-DD. */
  function mamToday(root) {
    if (mamClockOffsetMs !== null) return new Date(Date.now() + mamClockOffsetMs).toISOString().slice(0, 10);
    const newest = newestShout(root)?.querySelector(':scope > .ts')?.title.slice(0, 10);
    if (newest && /^\d{4}-\d{2}-\d{2}$/.test(newest)) return newest;
    const local = new Date();
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  }

  /** "2026-11-06" → "Today", "Yesterday" or a full date, relative to `todayIso`. */
  function friendlyDate(isoDate, todayIso) {
    const toUtcMs = (iso) => {
      const [year, month, day] = iso.split('-').map(Number);
      return Date.UTC(year, month - 1, day);
    };
    const daysAgo = Math.round((toUtcMs(todayIso) - toUtcMs(isoDate)) / DAY_MS);
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
    return new Date(toUtcMs(isoDate)).toLocaleDateString(undefined, {
      timeZone: 'UTC', // the date as written, not shifted into your timezone
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /** Relabel one of MaM's date breaks. The original YYYY-MM-DD is kept in data-mamsb-date. */
  function applyDate(dateBreak, todayIso) {
    if (!dateBreak.dataset.mamsbDate) {
      const isoDate = dateBreak.textContent.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return;
      dateBreak.dataset.mamsbDate = isoDate;
      dateBreak.title = isoDate;
    }
    const isoDate = dateBreak.dataset.mamsbDate;
    const text = settings.friendlyDates ? friendlyDate(isoDate, todayIso) : isoDate;
    if (dateBreak.textContent !== text) dateBreak.textContent = text;
  }

  /** Relabel every date break (cheap: there are only a few). */
  function applyAllDates(root) {
    const today = mamToday(root);
    root.querySelectorAll('.dateBreak').forEach((dateBreak) => applyDate(dateBreak, today));
  }

  // ---------------------------------------------------------------------------
  // Highlights (mentions)
  // ---------------------------------------------------------------------------
  let mentionPattern = null; // rebuilt whenever the highlight words change

  function buildMentionPattern() {
    const words = settings.highlightWords.map((word) => word.trim()).filter(Boolean);
    const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    // Whole words only, case-insensitive.
    mentionPattern = escaped.length ? new RegExp(`(^|[^\\w])(${escaped.join('|')})(?![\\w])`, 'i') : null;
  }

  function applyMention(shout) {
    const body = shout.querySelector(':scope > .mamsb-body');
    if (!body) return;
    let text = body.textContent;
    const senderName = body.querySelector(':scope > .mamsb-nick'); // "/me" shouts start with the sender
    if (senderName) text = text.slice(senderName.textContent.length);
    const quotedName = shout.querySelector(':scope > .mamsb-reply > a')?.textContent || '';
    const mentioned = Boolean(mentionPattern) && mentionPattern.test(`${quotedName} ${text}`);
    shout.classList.toggle('mamsb-mention', mentioned);
  }

  /** Hovering a name shows "name (Rank)"; MaM's own tooltip only had the rank. */
  function addNameTooltip(link) {
    if (!link) return;
    const name = link.querySelector('span')?.textContent.trim() || link.textContent.trim();
    if (!name) return;
    if (!('mamsbTitle' in link.dataset)) link.dataset.mamsbTitle = link.title || '';
    const rank = link.dataset.mamsbTitle;
    link.title = rank && rank !== name ? `${name} (${rank})` : name;
  }

  // ---------------------------------------------------------------------------
  // Your name in the message box
  // ---------------------------------------------------------------------------
  /** The logged-in user, from MaM's header menu. */
  function currentUser() {
    const menu = document.getElementById('userMenu');
    const nameNode = menu && [...menu.childNodes].find((node) => isTextNode(node) && node.data.trim());
    const name = nameNode?.data.trim() || '';
    const profileHref = document.querySelector('a.myInfo[href^="/u/"]')?.getAttribute('href') || '';
    const id = profileHref.match(/\d+/)?.[0] || '';
    return { name, id };
  }

  function buildInputNick(root) {
    const input = root.querySelector('#shbox_text');
    const { name, id } = currentUser();
    if (!input || !name || root.querySelector('.mamsb-input-nick')) return;
    const label = document.createElement('label');
    label.className = 'mamsb-input-nick';
    label.htmlFor = 'shbox_text';
    label.textContent = name;
    label.title = name;
    if (id) label.dataset.uid = id;
    input.before(label);
    colourInputNick(root);
  }

  // Your class colour isn't anywhere on the page except on your own shouts, so
  // once one of them has been seen it's remembered (per user ID). Otherwise the
  // name would be blue on visits where none of your shouts happen to be loaded,
  // and switch to your colour as soon as one appears.
  const OWN_COLOUR_KEY = 'mamsb-own-colour';
  let rememberedColour; // undefined until first read from storage

  function getRememberedColour(uid) {
    if (rememberedColour === undefined) {
      rememberedColour = null;
      try {
        const saved = JSON.parse(localStorage.getItem(OWN_COLOUR_KEY) || 'null');
        if (saved?.uid === uid) rememberedColour = saved.color;
      } catch {
        // unreadable storage: behave as if nothing was saved
      }
    }
    return rememberedColour;
  }

  function rememberColour(uid, color) {
    if (color === rememberedColour) return;
    rememberedColour = color;
    try {
      localStorage.setItem(OWN_COLOUR_KEY, JSON.stringify({ uid, color }));
    } catch {
      // storage blocked: it's only remembered for this page
    }
  }

  /** Your class colour: from one of your shouts if one is loaded, else the remembered one. */
  function colourInputNick(root) {
    const label = root.querySelector('.mamsb-input-nick');
    const uid = label?.dataset.uid;
    if (!uid) return;
    const yourName = root.querySelector(`.sbf a[href="/u/${uid}"] > span[data-uc]`);
    if (yourName) {
      // A name drawn as a coloured tag (e.g. staff) has dark or light text on a
      // coloured background; in the message box use the tag's colour instead.
      const originalTag = 'mamsbBg' in yourName.dataset ? yourName.dataset.mamsbBg : yourName.style.backgroundColor;
      const tagRgb = parseRgb(originalTag);
      const tagAsText = tagRgb && settings.fixNickContrast ? readableColour(tagRgb) || tagRgb : tagRgb;
      const yourRgb = tagAsText || parseRgb(yourName.style.color);
      if (yourRgb) rememberColour(uid, `rgb(${yourRgb.join(', ')})`);
    }
    // Blue until one of your shouts has ever been seen.
    const color = getRememberedColour(uid) || 'var(--sb-accent-hover)';
    if (label.style.color !== color) label.style.color = color;
  }

  // ---------------------------------------------------------------------------
  // Restructuring each shout
  // ---------------------------------------------------------------------------
  // MaM sends a shout as one flat line:
  //   <span.ts> <⋮> <quote> <@> <a name> ": " message…
  // We keep MaM's own elements (its click handlers rely on them), hide the ": ",
  // pull a leading quote out into a reply line, and wrap the message in
  // .mamsb-body so the CSS grid can lay it out in columns.

  /**
   * MaM renders a quote as:
   *   <img.sbQuote> "@" <a user> ' "' <i>excerpt</i> '" rest of message'
   * Pull that out into a reply line. Returns the reply element, or null if the
   * shout doesn't start with a quote in exactly that shape.
   */
  function extractReply(first) {
    const icon = first;
    const at = icon?.nextSibling;
    const link = at?.nextSibling;
    const openQuote = link?.nextSibling;
    const excerpt = openQuote?.nextSibling;
    const closeQuote = excerpt?.nextSibling;

    if (!isElementMatching(icon, 'img.sbQuote')) return null;
    if (!isTextNode(at) || at.data.trim() !== '@') return null;
    if (!isProfileLink(link)) return null;
    if (!isTextNode(openQuote) || openQuote.data.trim() !== '"') return null;
    if (!isElementMatching(excerpt, 'i')) return null;
    if (closeQuote && !(isTextNode(closeQuote) && closeQuote.data.startsWith('"'))) return null;

    // The closing quote's text node also holds the rest of the message; split it off.
    if (closeQuote && closeQuote.data.length > 1) closeQuote.splitText(1);

    const reply = document.createElement('div');
    reply.className = 'mamsb-reply';
    reply.title = 'Jump to quoted shout';
    reply.tabIndex = 0;
    reply.setAttribute('role', 'button');
    icon.before(reply);
    // The "@" and quote marks stay in the DOM, just hidden.
    reply.append(icon, wrapHidden(at), link, wrapHidden(openQuote), excerpt);
    if (closeQuote) reply.append(wrapHidden(closeQuote));
    return reply;
  }

  // Direct children of a shout that are MaM's or ours; anything else that turns
  // up later (MaM appending to a shout) gets moved into the message body.
  const SHOUT_PARTS = '.ts, .sb_menu, .sbNewQuote, .sbAt, .mamsb-nick, .mamsb-hide, .mamsb-reply, .mamsb-body';

  function processShout(shout) {
    if (!SHOUT_ID.test(shout.id)) return;

    const existingBody = shout.querySelector(':scope > .mamsb-body');
    if (existingBody) {
      const strays = [...shout.childNodes].filter((n) => n !== existingBody && !isElementMatching(n, SHOUT_PARTS));
      if (strays.length) existingBody.append(...strays);
      return;
    }

    const nameLink = [...shout.children].find(isProfileLink);
    if (!nameLink) return;
    nameLink.classList.add('mamsb-nick');
    addNameTooltip(nameLink);

    const timeEl = shout.querySelector(':scope > .ts');
    if (timeEl) applyTime(timeEl);

    // Hide the ": " after the name.
    let lastPart = nameLink;
    const separator = nameLink.nextSibling;
    const separatorMatch = isTextNode(separator) && separator.data.match(/^\s*:\s*/);
    if (separatorMatch) {
      if (separatorMatch[0].length < separator.data.length) separator.splitText(separatorMatch[0].length);
      lastPart = wrapHidden(separator);
    }

    const reply = extractReply(lastPart.nextSibling);
    if (reply) {
      lastPart = reply;
      addNameTooltip(reply.querySelector('a'));
    }

    // Everything after that is the message.
    const body = document.createElement('span');
    body.className = 'mamsb-body';
    const messageNodes = [];
    for (let node = lastPart.nextSibling; node; node = node.nextSibling) messageNodes.push(node);
    body.append(...messageNodes);
    shout.append(body);

    // "/me" shouts read as one sentence: move the name into the text.
    if (shout.classList.contains('action')) body.prepend(nameLink);

    shout.classList.add('mamsb-msg');
    applyColours(shout);
    applyMention(shout);
  }

  // ---------------------------------------------------------------------------
  // Replies: jump to the quoted shout
  // ---------------------------------------------------------------------------
  const MISSING_NOTE_MS = 2500;

  function jumpToQuoted(root, reply) {
    const icon = reply.querySelector('img.sbQuote');
    const target = icon && document.getElementById(icon.dataset.id);
    const list = root.querySelector('#sbf');

    if (!target || !list || !list.contains(target)) {
      // Older than what's loaded. Let MaM's own handler try, and say why nothing moved.
      icon?.click();
      reply.classList.add('mamsb-reply-missing');
      clearTimeout(reply.mamsbMissingTimer);
      reply.mamsbMissingTimer = setTimeout(() => reply.classList.remove('mamsb-reply-missing'), MISSING_NOTE_MS);
      return;
    }

    // Scroll only the message list, centring the quoted shout.
    const listTop = list.getBoundingClientRect().top;
    const targetBox = target.getBoundingClientRect();
    const top = list.scrollTop + (targetBox.top - listTop) - (list.clientHeight - targetBox.height) / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    // Restart the flash animation: remove the class, force a reflow, add it back.
    target.classList.remove('mamsb-jumped');
    void target.offsetWidth;
    target.classList.add('mamsb-jumped');
  }

  // ---------------------------------------------------------------------------
  // Maximise ("view fullscreen"): keep your place on the page
  // ---------------------------------------------------------------------------
  // MaM maximises by making #shoutbox position: fixed over the page. That takes
  // it out of the page, the page gets shorter and the browser pulls the scroll
  // position up (usually to the top). We remember where you were while the
  // shoutbox is normal size, and go back there once it's restored.
  const RESTORE_RECHECK_MS = [150, 400, 700]; // in case MaM's own code scrolls to the top late
  let maximised = false; // kept up to date by onShoutboxStyleChange
  let pageScrollY = window.scrollY;
  let pageScrollX = window.scrollX; // only changes on zoomed-in phones

  function isMaximised(root) {
    // MaM sets position inline when maximising / restoring, so read that.
    // (Mobile view's own CSS also forces position: fixed, so the computed style
    // can't tell us anything while it's on.)
    if (root.style.position) return root.style.position === 'fixed';
    return !mobileViewActive && getComputedStyle(root).position === 'fixed';
  }

  /** MaM changes #shoutbox's inline style to maximise / restore it. */
  function onShoutboxStyleChange(root) {
    fitHeight(root);
    const nowMaximised = isMaximised(root);
    if (nowMaximised === maximised) return;
    maximised = nowMaximised;
    const leftMobileView = mobileViewActive && !nowMaximised;
    updateMobileView(root);
    if (!nowMaximised) restorePageScroll(pageScrollY, leftMobileView);
  }

  /**
   * Scroll the page back to `y`. Normally we only step in again if something
   * threw the page to the top, so a scroll you make yourself is left alone.
   * After mobile view the page has just been re-laid out at a different
   * width, so it can end up anywhere: then `force` puts it back regardless.
   */
  function restorePageScroll(y, force = false) {
    if (y <= 5 && !force) return; // you were at the top anyway
    const x = force ? pageScrollX : 0;
    setTimeout(() => window.scrollTo(x, y), 0); // once MaM has finished restoring
    for (const delay of RESTORE_RECHECK_MS) {
      setTimeout(() => {
        const thrownToTop = window.scrollY < 5 && y > 5;
        const misplaced = force && (Math.abs(window.scrollY - y) > 2 || Math.abs(window.scrollX - x) > 2);
        if (thrownToTop || misplaced) window.scrollTo(x, y);
      }, delay);
    }
  }

  // ---------------------------------------------------------------------------
  // Mobile view (touch-friendly layout while full screen)
  // ---------------------------------------------------------------------------
  // MaM's site has no mobile layout, so phones show it zoomed out. While the
  // shoutbox is full screen nothing else is visible, so there we can safely
  // switch the page to phone width and give the shoutbox a touch layout. On
  // exit the page's previous width is put back.
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  let mobileViewActive = false;
  let savedViewport = null; // { meta, content, layoutWidth, zoom }
  const ZOOM_SETTLE_MS = 300; // how long the restored zoom hint stays before it's dropped
  let visibleAreaListener = null;

  /** Should full screen use mobile view on this device? */
  function usesMobileView() {
    if (settings.mobileView === 'always') return true;
    if (settings.mobileView === 'never') return false;
    return coarsePointer.matches; // 'auto': touch screens (phones, most tablets)
  }

  function updateMobileView(root) {
    const shouldBeActive = usesMobileView() && isMaximised(root);
    if (shouldBeActive === mobileViewActive) return;
    if (shouldBeActive) enterMobileView(root);
    else exitMobileView(root);
  }

  function enterMobileView(root) {
    mobileViewActive = true;
    switchViewportToDevice();
    document.documentElement.classList.add('mamsb-mobile-open');
    root.classList.add('mamsb-mobile');
    // Follow the visible area: it shrinks when the on-screen keyboard opens.
    visibleAreaListener = () => {
      fitToVisibleArea(root);
      zoomPill.onZoomChange(root);
    };
    window.visualViewport?.addEventListener('resize', visibleAreaListener);
    window.visualViewport?.addEventListener('scroll', visibleAreaListener);
    window.addEventListener('resize', visibleAreaListener);
    fitToVisibleArea(root);
    const list = root.querySelector('#sbf');
    if (list) scrollToNewest(list); // start on the newest shouts
  }

  function exitMobileView(root) {
    mobileViewActive = false;
    window.visualViewport?.removeEventListener('resize', visibleAreaListener);
    window.visualViewport?.removeEventListener('scroll', visibleAreaListener);
    window.removeEventListener('resize', visibleAreaListener);
    visibleAreaListener = null;
    zoomPill.hide(root);
    root.classList.remove('mamsb-mobile');
    root.querySelectorAll('.mamsb-tapped').forEach((shout) => shout.classList.remove('mamsb-tapped'));
    document.documentElement.classList.remove('mamsb-mobile-open');
    restoreViewport();
  }

  /** Lay the page out at the phone's width (only matters on mobile browsers). */
  function switchViewportToDevice() {
    let meta = document.querySelector('meta[name="viewport"]');
    savedViewport = {
      meta,
      content: meta?.getAttribute('content') ?? null,
      layoutWidth: document.documentElement.clientWidth, // e.g. 980 on a phone
      zoom: window.visualViewport?.scale ?? null, // how far the page was zoomed out
    };
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.append(meta);
      savedViewport.meta = meta;
    }
    // interactive-widget: Android shrinks the page for the keyboard by itself.
    meta.setAttribute('content', 'width=device-width, initial-scale=1, interactive-widget=resizes-content');
  }

  /**
   * Put the page's width and zoom back: the viewport setting there was before
   * (or, if there was none, "the width it had before" explicitly, since just
   * removing ours leaves phones at the wrong width). The width alone leaves
   * phones zoomed in, so the old zoom is asked for too, then that hint is
   * dropped once it has taken effect so pinch-zoom works normally again.
   */
  function restoreViewport() {
    if (!savedViewport) return;
    const { meta, content, layoutWidth, zoom } = savedViewport;
    savedViewport = null;
    setViewportWithZoom(meta, content ?? `width=${layoutWidth}`, zoom);
  }

  /** Set a viewport, briefly asking for `zoom` too so the browser applies it. */
  function setViewportWithZoom(meta, content, zoom) {
    if (!zoom || /initial-scale/.test(content)) {
      meta.setAttribute('content', content);
      return;
    }
    meta.setAttribute('content', `${content}, initial-scale=${zoom.toFixed(4)}`);
    setTimeout(() => meta.setAttribute('content', content), ZOOM_SETTLE_MS);
  }

  // ---------------------------------------------------------------------------
  // Phones: fit MaM's page to the screen
  // ---------------------------------------------------------------------------
  // MaM has no viewport tag, so phones lay the page out 980px wide and zoom to
  // fit that. But the page is a little wider (its top menu alone is 950px plus
  // margins), so some browsers (Firefox for Android) open it slightly zoomed in.
  // Telling the phone the page's real width makes the whole page fit. Only on
  // touch devices, and only if MaM hasn't set a viewport of its own. The
  // shoutbox's mobile view switches this out and back like any viewport.
  let fitViewportMeta = null; // the viewport tag we added for this, if any

  function fitPageToScreen() {
    if (!coarsePointer.matches || mobileViewActive) return;
    let meta = document.querySelector('meta[name="viewport"]');
    if (meta && meta !== fitViewportMeta) return; // the site has its own
    const pageWidth = document.documentElement.scrollWidth;
    if (pageWidth <= document.documentElement.clientWidth + 1) return; // already fits
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.append(meta);
      fitViewportMeta = meta;
    }
    // screen.width is the phone's width at normal zoom, in CSS pixels.
    setViewportWithZoom(meta, `width=${pageWidth}`, window.screen.width / pageWidth);
  }

  /** Size the full-screen shoutbox to the visible area (above the keyboard). */
  function fitToVisibleArea(root) {
    const viewport = window.visualViewport;
    const area = viewport
      ? { top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height }
      : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    const list = root.querySelector('#sbf');
    const apply = () => {
      // Set on <html> rather than #shoutbox, so MaM-maximise detection (which
      // watches #shoutbox's style) isn't triggered on every keyboard frame.
      const html = document.documentElement.style;
      html.setProperty('--sb-vv-top', `${area.top}px`);
      html.setProperty('--sb-vv-left', `${area.left}px`);
      html.setProperty('--sb-vv-w', `${area.width}px`);
      html.setProperty('--sb-vv-h', `${area.height}px`);
    };
    if (list) keepingNewestInView(list, apply);
    else apply();
  }

  // ---------------------------------------------------------------------------
  // Mobile view: "Zoomed in · Reset zoom"
  // ---------------------------------------------------------------------------
  // Mobile view is laid out for zoom 1 and follows the visible area, so pinching
  // in squeezes it into a cramped layout. After a pinch settles we offer to
  // reset the zoom. A page can't set the zoom directly, but the browser
  // re-applies the viewport tag's starting zoom when it changes, so we briefly
  // change it (0.9999 instead of 1, and no zooming in), then put it back.
  // (iPhones may ignore that; then the pill says to pinch out instead.)
  const zoomPill = {
    ZOOMED_IN: 1.05, // above this zoom counts as zoomed in
    SHOW_DELAY_MS: 700, // wait for the pinch to finish before showing
    RESET_CHECK_MS: 400, // how long the browser gets to zoom back out
    timer: null,
    dismissed: false, // closed with ×: stays away until you're back at zoom 1

    build(root) {
      if (root.querySelector('.mamsb-zoom-pill')) return;
      const pill = document.createElement('div');
      pill.className = 'mamsb-zoom-pill';
      pill.setAttribute('role', 'status');
      pill.hidden = true;
      const text = document.createElement('span');
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'mamsb-zoom-reset';
      reset.textContent = 'Reset zoom';
      reset.addEventListener('click', () => this.resetZoom(root));
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'mamsb-zoom-close';
      close.textContent = '×';
      close.title = 'Dismiss';
      close.setAttribute('aria-label', 'Dismiss');
      close.addEventListener('click', () => {
        this.dismissed = true;
        pill.hidden = true;
      });
      pill.append(text, reset, close);
      root.append(pill);
    },

    scale() {
      return window.visualViewport?.scale ?? 1;
    },

    /** Called whenever the visible area changes while in mobile view. */
    onZoomChange(root) {
      const pill = root.querySelector('.mamsb-zoom-pill');
      if (!pill) return;
      clearTimeout(this.timer);
      if (this.scale() <= this.ZOOMED_IN) {
        this.dismissed = false;
        pill.hidden = true;
        return;
      }
      if (!pill.hidden) {
        this.place(root, pill); // follow the visible area while shown
        return;
      }
      this.timer = setTimeout(() => {
        if (!mobileViewActive || this.dismissed || this.scale() <= this.ZOOMED_IN) return;
        this.setMessage(pill, 'Zoomed in', true);
        pill.hidden = false;
        this.place(root, pill);
      }, this.SHOW_DELAY_MS);
    },

    setMessage(pill, message, offerReset) {
      pill.querySelector('span').textContent = message;
      pill.querySelector('.mamsb-zoom-reset').hidden = !offerReset;
    },

    /** Just above the message list's bottom edge, at normal size despite the zoom. */
    place(root, pill) {
      const list = root.querySelector('#sbf');
      const bottom = list ? list.offsetTop + list.offsetHeight : root.clientHeight;
      pill.style.top = `${bottom - 12}px`;
      pill.style.transform = `translate(-50%, -100%) scale(${1 / this.scale()})`;
    },

    resetZoom(root) {
      const meta = document.querySelector('meta[name="viewport"]');
      const pill = root.querySelector('.mamsb-zoom-pill');
      if (!meta || !pill) return;
      const content = meta.getAttribute('content');
      const clamped = `${content.replace(/,?\s*initial-scale=[\d.]+/, '')}, initial-scale=0.9999, maximum-scale=1`;
      meta.setAttribute('content', clamped);
      setTimeout(() => {
        // Put pinch-zoom back, unless leaving mobile view has already replaced the tag.
        if (meta.getAttribute('content') === clamped) meta.setAttribute('content', content);
        if (mobileViewActive && this.scale() > this.ZOOMED_IN) {
          this.setMessage(pill, 'Pinch out to reset the zoom', false); // the browser didn't do it
        }
      }, this.RESET_CHECK_MS);
    },

    hide(root) {
      clearTimeout(this.timer);
      this.dismissed = false;
      const pill = root.querySelector('.mamsb-zoom-pill');
      if (pill) pill.hidden = true;
    },
  };

  // Full time on tap (there are no hover tooltips on touch screens).
  const TIME_PEEK_MS = 3000;

  function peekFullTime(timeEl) {
    if (!timeEl.title) return;
    timeEl.textContent = timeEl.title;
    clearTimeout(timeEl.mamsbPeekTimer);
    timeEl.mamsbPeekTimer = setTimeout(() => applyTime(timeEl), TIME_PEEK_MS);
  }

  /** Taps in mobile view: a shout shows its buttons, a time shows in full. */
  const noHover = window.matchMedia('(hover: none)');

  /** Tapping a shout shows its buttons: in mobile view, and anywhere without a mouse. */
  function onMobileTap(root, event) {
    if (!mobileViewActive && !noHover.matches) return;
    const target = event.target;
    const timeEl = target.closest('.mamsb-msg > .ts');
    if (timeEl && mobileViewActive) {
      peekFullTime(timeEl);
      return;
    }
    // Links, buttons, reply lines and MaM's own controls do their own thing.
    if (target.closest('a, button, input, select, label, .mamsb-reply, .sb_menu, #sbMenuMain, #sbEditOverlay')) return;
    const shout = target.closest('.mamsb-msg');
    for (const other of root.querySelectorAll('.mamsb-tapped')) {
      if (other !== shout) other.classList.remove('mamsb-tapped');
    }
    shout?.classList.toggle('mamsb-tapped');
  }

  /** "📱 Mobile view" next to MaM's ⛶, and "✕ Exit" in the tab bar. */
  function buildMobileControls(root) {
    const toggle = root.querySelector('#sbFullToggle');
    if (!toggle || root.querySelector('.mamsb-mobile-btn')) return;

    const enter = document.createElement('button');
    enter.type = 'button';
    enter.className = 'mamsb-mobile-btn';
    enter.textContent = '📱 Mobile view';
    enter.title = 'Full screen, touch-friendly';
    enter.addEventListener('click', () => toggle.click()); // MaM's ⛶ does the maximising
    toggle.before(enter);

    const nav = findTabBar(root);
    if (!nav) return;
    const li = document.createElement('li');
    li.className = 'mamsb-exit';
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'mamsb-exit-btn';
    exit.textContent = '✕ Exit';
    exit.title = 'Leave full-screen view';
    exit.addEventListener('click', () => {
      if (isMaximised(root)) toggle.click(); // MaM's ⛶ restores it
    });
    li.append(exit);
    nav.append(li);
  }

  // ---------------------------------------------------------------------------
  // Diagnostics: what is styling the shoutbox (for reporting layout problems)
  // ---------------------------------------------------------------------------
  // Phones can load styles from MaM that a desktop never sees, so this collects
  // everything needed to see who is winning: the stylesheets loaded, and for a
  // few key elements their final styles and every rule that applies to them.
  // It runs in mobile view (entering it briefly if needed) and shows the report
  // in a box with a Copy button.
  const DIAGNOSTIC_ELEMENTS = {
    'name icon': '#sbf .mamsb-msg > .mamsb-nick img:not(.sb_country)',
    'name link': '#sbf .mamsb-msg > .mamsb-nick',
    'mention link': '#sbf .mamsb-body a[href^="/u/"]',
    'Load Older': '#sbf .loadMore',
    shout: '#sbf .mamsb-msg',
    'tab bar': '#shoutbox > :is(#sbMenuTabs, .ui-tabs-nav)',
    'Settings tab item': '#shoutbox li.mamsb-settings',
    'Settings button': '.mamsb-settings-btn',
    'Exit tab item': '#shoutbox li.mamsb-exit',
    'tapped shout': '#sbf .mamsb-msg.mamsb-tapped',
    'tapped ⋮ button': '#sbf .mamsb-msg.mamsb-tapped > .sb_menu',
    'tapped @ button': '#sbf .mamsb-msg.mamsb-tapped > .sbAt',
    '⋮ menu box': '#sbMenuMain > ul',
    '⋮ menu name': '#sbMenuMain #sbun > span',
    'message form': '#sbform',
    'message input': '#shbox_text',
    'Shout button': '#shout_send',
  };
  const DIAGNOSTIC_PROPERTIES = [
    'display', 'visibility', 'opacity', 'position', 'order', 'float', 'flex',
    'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
    'margin', 'padding', 'border', 'border-radius', 'font-size', 'text-transform', 'zoom', 'transform',
    'top', 'right', 'bottom', 'left', 'grid-area', 'background-color',
  ];
  const DIAGNOSTICS_SETTLE_MS = 800;

  /** Every style rule in a sheet, with the @media / @supports it sits in. */
  function* rulesOf(ruleList, context = '') {
    for (const rule of ruleList) {
      if (rule.selectorText !== undefined) {
        yield { rule, context };
      } else if (rule.cssRules) {
        const condition = rule.conditionText || rule.media?.mediaText || rule.name || '';
        const label = `${rule.constructor.name.replace(/^CSS|Rule$/g, '')} ${condition}`.trim();
        yield* rulesOf(rule.cssRules, `${context}@${label} `);
      }
    }
  }

  function describeElement(label, element) {
    if (!element) return `## ${label}: not found\n`;
    const computed = getComputedStyle(element);
    const lines = [`## ${label}: <${element.tagName.toLowerCase()} class="${element.className}">`];
    lines.push(`   size ${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`);
    lines.push(`   computed: ${DIAGNOSTIC_PROPERTIES.map((name) => `${name}=${computed.getPropertyValue(name)}`).join('; ')}`);
    if (element.getAttribute('style')) lines.push(`   inline style: ${element.getAttribute('style')}`);
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode?.id === 'mamsb-style') continue; // ours
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // unreadable (listed separately)
      }
      for (const { rule, context } of rulesOf(rules)) {
        let matches = false;
        try {
          matches = element.matches(rule.selectorText);
        } catch {
          // selector this browser can't test
        }
        if (!matches) continue;
        const relevant = DIAGNOSTIC_PROPERTIES.flatMap((name) => {
          const value = rule.style.getPropertyValue(name);
          if (!value) return [];
          return [`${name}: ${value}${rule.style.getPropertyPriority(name) ? ' !important' : ''}`];
        });
        if (relevant.length) {
          const source = sheet.href ? sheet.href.split('/').pop() : 'inline <style>';
          lines.push(`   [${source}] ${context}${rule.selectorText} { ${relevant.join('; ')} }`);
        }
      }
    }
    return `${lines.join('\n')}\n`;
  }

  function buildDiagnosticsReport(root) {
    const lines = [
      `MaM Shoutbox Modern Redesign diagnostics (${new Date().toISOString()})`,
      `browser: ${navigator.userAgent}`,
      `window ${window.innerWidth}x${window.innerHeight}, visible ${Math.round(window.visualViewport?.width ?? 0)}x${Math.round(window.visualViewport?.height ?? 0)}, zoom ${window.visualViewport?.scale ?? '?'}, pixel ratio ${window.devicePixelRatio}`,
      `page width ${document.documentElement.clientWidth}, mobile view ${mobileViewActive}, viewport tag: ${document.querySelector('meta[name="viewport"]')?.content ?? 'none'}`,
      `shoutbox classes: ${root.className}`,
      '',
      '# Stylesheets',
    ];
    for (const sheet of document.styleSheets) {
      let readable = true;
      try {
        void sheet.cssRules;
      } catch {
        readable = false;
      }
      const media = sheet.media?.mediaText ? ` media="${sheet.media.mediaText}"` : '';
      const name = sheet.href || `inline <style${sheet.ownerNode?.id ? ` id="${sheet.ownerNode.id}"` : ''}>`;
      lines.push(`- ${name}${media}${readable ? '' : ' (not readable from the page)'}`);
    }
    lines.push('', '# Elements');
    for (const [label, selector] of Object.entries(DIAGNOSTIC_ELEMENTS)) {
      lines.push(describeElement(label, document.querySelector(selector)));
    }
    return lines.join('\n');
  }

  function showDiagnosticsReport(text) {
    document.getElementById('mamsb-diagnostics')?.remove();
    const box = document.createElement('div');
    box.id = 'mamsb-diagnostics';
    const intro = document.createElement('p');
    intro.textContent = 'Diagnostics: copy this and send it along with a description of the problem.';
    const area = document.createElement('textarea');
    area.readOnly = true;
    area.value = text;
    const buttons = document.createElement('div');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
      } catch {
        area.select(); // clipboard blocked: select it for a manual copy
        copy.textContent = 'Selected: copy it manually';
      }
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => box.remove());
    buttons.append(copy, close);
    box.append(intro, area, buttons);
    document.body.append(box);
  }

  /** Collect in mobile view (entering it for a moment if needed), then show the report. */
  function collectDiagnostics(root) {
    if (mobileViewActive || !usesMobileView()) {
      showDiagnosticsReport(buildDiagnosticsReport(root));
      return;
    }
    const toggle = root.querySelector('#sbFullToggle');
    if (!toggle) {
      showDiagnosticsReport(buildDiagnosticsReport(root));
      return;
    }
    toggle.click(); // into mobile view
    setTimeout(() => {
      const report = buildDiagnosticsReport(root);
      showDiagnosticsReport(report);
    }, DIAGNOSTICS_SETTLE_MS);
  }

  // ---------------------------------------------------------------------------
  // Load Older: keep your place in the shouts
  // ---------------------------------------------------------------------------
  // MaM inserts the older shouts above everything while the list is scrolled to
  // the top, so you'd land on the oldest new shout. Browsers' own scroll
  // anchoring doesn't help (Chrome skips it at the very top; Safari has none),
  // so we put the shout you were reading back where it was ourselves.
  const LOAD_TIMEOUT_MS = 20000; // give up if MaM never delivers (end of history, error)
  const LOAD_RECHECK_MS = [150, 400, 1000]; // MaM settling, images above loading

  let pendingLoad = null;

  function startLoadOlder(root) {
    const list = root.querySelector('#sbf');
    const shouts = list ? [...list.querySelectorAll('.mamsb-msg')] : [];
    if (!shouts.length) return;
    const listTop = list.getBoundingClientRect().top;
    const firstVisible = shouts.find((shout) => shout.getBoundingClientRect().bottom > listTop + 1) || shouts[0];
    clearPendingLoad();
    const olderBelow = newestFirst(); // newest-first lists get older shouts at the bottom
    pendingLoad = {
      olderBelow,
      oldestShout: olderBelow ? shouts[shouts.length - 1] : shouts[0], // older shouts arrive beyond this one
      anchor: firstVisible, // the shout at the top of your view
      anchorOffset: firstVisible.getBoundingClientRect().top - listTop,
      expiresAt: Date.now() + LOAD_TIMEOUT_MS,
      divider: null,
      timers: [],
    };
  }

  function clearPendingLoad() {
    if (!pendingLoad) return;
    pendingLoad.timers.forEach(clearTimeout);
    pendingLoad = null;
  }

  function hasShoutAbove(shout) {
    for (let el = shout.previousElementSibling; el; el = el.previousElementSibling) {
      if (el.classList.contains('mamsb-msg')) return true;
    }
    return false;
  }

  function hasShoutBelow(shout) {
    for (let el = shout.nextElementSibling; el; el = el.nextElementSibling) {
      if (el.classList.contains('mamsb-msg')) return true;
    }
    return false;
  }

  /** Called after each batch of new shouts has been processed. */
  function settleLoadOlder(root) {
    const load = pendingLoad;
    if (!load) return;
    if (Date.now() > load.expiresAt || !load.oldestShout.isConnected || !load.anchor.isConnected) {
      clearPendingLoad();
      return;
    }
    const arrived = load.olderBelow ? hasShoutBelow(load.oldestShout) : hasShoutAbove(load.oldestShout);
    if (!arrived) return; // still waiting for MaM

    if (!load.divider) {
      root.querySelectorAll('.mamsb-loaded-divider').forEach((old) => old.remove());
      load.divider = document.createElement('div');
      load.divider.className = 'mamsb-loaded-divider';
      if (load.olderBelow) {
        // Added below what you were reading, so nothing moved: just mark it.
        load.divider.textContent = 'Earlier shouts loaded below';
        load.oldestShout.after(load.divider);
        clearPendingLoad();
        return;
      }
      load.divider.textContent = 'Earlier shouts loaded above';
      load.oldestShout.before(load.divider);

      for (const delay of LOAD_RECHECK_MS) {
        load.timers.push(setTimeout(() => alignToAnchor(root, load), delay));
      }
      load.timers.push(setTimeout(clearPendingLoad, Math.max(...LOAD_RECHECK_MS) + 50));
    }
    alignToAnchor(root, load);
  }

  /** Scroll so the shout you were reading is back where it was. */
  function alignToAnchor(root, load) {
    const list = root.querySelector('#sbf');
    if (!list || pendingLoad !== load) return;
    let wantedOffset = load.anchorOffset;
    if (load.anchor === load.oldestShout) {
      // You were at the top: push it down to show the divider and a sliver of
      // what loaded, so it's clear more arrived.
      const dividerShown = load.divider.getClientRects().length > 0;
      const dividerSpace = dividerShown
        ? load.anchor.getBoundingClientRect().top - load.divider.getBoundingClientRect().top
        : 0;
      wantedOffset = Math.max(0, load.anchorOffset) + dividerSpace + LOAD_PEEK;
    }
    const currentOffset = load.anchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const difference = currentOffset - wantedOffset;
    if (Math.abs(difference) > 1) list.scrollTop += difference;
  }

  // ---------------------------------------------------------------------------
  // Esc: leave full-screen view
  // ---------------------------------------------------------------------------
  function isOpen(id) {
    const el = document.getElementById(id);
    return Boolean(el) && !el.classList.contains('hideMe') && el.getClientRects().length > 0;
  }

  function onEscape(root, event) {
    if (event.key !== 'Escape' || event.defaultPrevented || !settings.escRestoresSize) return;
    if (!isMaximised(root)) return;
    // Let Esc close smaller things first: MaM's ⋮ menu or edit dialog.
    if (isOpen('sbMenuMain') || isOpen('sbEditOverlay')) return;
    const toggle = root.querySelector('#sbFullToggle');
    if (!toggle) return;
    event.preventDefault();
    toggle.click(); // MaM's own ⛶ button does the restoring
  }

  // ---------------------------------------------------------------------------
  // ⋮ menu: pop up beside the button that opened it
  // ---------------------------------------------------------------------------
  const MENU_GAP = 4;
  let menuButton = null; // the ⋮ last clicked

  function positionMenu() {
    const box = document.querySelector('#sbMenuMain > ul');
    if (!box || !menuButton?.isConnected || !box.getClientRects().length) return;

    const setImportant = (property, value) => box.style.setProperty(property, value, 'important');
    setImportant('position', 'absolute');
    setImportant('right', 'auto');
    setImportant('bottom', 'auto');
    setImportant('width', 'max-content');
    setImportant('height', 'auto');

    const parent = box.offsetParent || document.body;
    const parentBox = parent.getBoundingClientRect();
    const buttonBox = menuButton.getBoundingClientRect();
    const width = box.offsetWidth;
    const height = box.offsetHeight;

    // Right-aligned with the button, below it; above it if there's no room below.
    let left = buttonBox.right - width;
    let top = buttonBox.bottom + MENU_GAP;
    const bottomLimit = Math.min(window.innerHeight, parentBox.bottom);
    const fitsAbove = buttonBox.top - MENU_GAP - height >= Math.max(0, parentBox.top);
    if (top + height > bottomLimit && fitsAbove) top = buttonBox.top - MENU_GAP - height;
    left = Math.max(parentBox.left, Math.min(left, window.innerWidth - width - 8));

    // Convert from window coordinates to the menu's positioning parent.
    setImportant('left', `${left - parentBox.left + parent.scrollLeft - parent.clientLeft}px`);
    setImportant('top', `${top - parentBox.top + parent.scrollTop - parent.clientTop}px`);
  }

  // ---------------------------------------------------------------------------
  // Fit the shoutbox to the window height
  // ---------------------------------------------------------------------------
  /**
   * Size the message list so the whole shoutbox (tabs, list, message box) fits
   * the window with FILL_MARGIN px above and below. Skipped while maximised,
   * where MaM sizes the list itself.
   */
  const MIN_HEIGHT_CHANGE = 2; // px; smaller differences are rounding, not a real change
  let fitGuard = null; // created in setUpSizing (needs root for its notice)

  function fitHeight(root) {
    const list = root.querySelector('#sbf');
    if (!list) return;
    const enabled = settings.fillHeight && !isMaximised(root) && !fitGuard?.tripped;

    // Measure against whichever tab panel is showing (shouts or Smilies);
    // both get the same height.
    const shownPanel = [...root.querySelectorAll(':scope > .sbf')].find((panel) => panel.getClientRects().length);
    if (enabled && shownPanel) {
      const otherParts = root.getBoundingClientRect().height - shownPanel.getBoundingClientRect().height;
      const available = Math.floor(window.innerHeight - 2 * FILL_MARGIN - otherParts);
      const height = Math.max(MIN_LIST_HEIGHT, available);
      // Kept on <html>, not #shoutbox, so writing it doesn't re-trigger the
      // watcher on #shoutbox's style (see setUpSizing).
      const htmlStyle = document.documentElement.style;
      const current = Number.parseFloat(htmlStyle.getPropertyValue('--sb-list-h'));
      const changed = Number.isNaN(current) || Math.abs(current - height) >= MIN_HEIGHT_CHANGE;
      if (changed && (!fitGuard || fitGuard.allow())) {
        keepingNewestInView(list, () => htmlStyle.setProperty('--sb-list-h', `${height}px`));
      }
    }
    const fillOn = enabled && !fitGuard?.tripped;
    if (root.classList.contains('mamsb-fill') !== fillOn) {
      keepingNewestInView(list, () => root.classList.toggle('mamsb-fill', fillOn));
    }
  }

  // ---------------------------------------------------------------------------
  // Applying settings
  // ---------------------------------------------------------------------------
  /** Settings that only need classes / CSS variables on #shoutbox. Cheap. */
  function applyLayout(root) {
    root.classList.toggle('mamsb-hide-flags', !settings.showFlags);
    root.classList.toggle('mamsb-hide-icons', !settings.showUserIcons);
    root.classList.toggle('mamsb-zebra', settings.zebraRows);
    root.classList.toggle('mamsb-hover-outline', settings.hoverOutline);
    root.classList.toggle('mamsb-input-nick-on', settings.showInputNick);
    root.classList.toggle('mamsb-load-divider-on', settings.loadDivider);
    root.style.setProperty('--sb-zebra', String(settings.zebraStrength / 100));
    root.style.setProperty('--sb-hover', String(HOVER_SHADE / 100));
    root.style.setProperty('--sb-nick-w', `${settings.nickColumnWidth}px`);
    root.style.setProperty('--sb-time-w', settings.shortTimestamps ? '38px' : '56px');
    root.classList.toggle('mamsb-touch', usesMobileView());
    fitHeight(root);
    updateMobileView(root);
  }

  // Settings that need every shout revisited, and what to redo for each.
  // Anything not listed here only needs applyLayout().
  const SETTING_EFFECTS = {
    shortTimestamps: ['times'],
    friendlyDates: ['dates'],
    fixNickContrast: ['colours'],
    nickBackgrounds: ['colours'],
    highlightWords: ['mentions'],
  };
  const ALL_EFFECTS = ['times', 'dates', 'colours', 'mentions'];

  function applySettings(root, effects = ALL_EFFECTS) {
    applyLayout(root);
    if (effects.includes('mentions')) buildMentionPattern();
    if (effects.includes('times') || effects.includes('colours') || effects.includes('mentions')) {
      for (const shout of root.querySelectorAll('.mamsb-msg')) {
        if (effects.includes('times')) {
          const timeEl = shout.querySelector(':scope > .ts');
          if (timeEl) applyTime(timeEl);
        }
        if (effects.includes('colours')) applyColours(shout);
        if (effects.includes('mentions')) applyMention(shout);
      }
    }
    if (effects.includes('dates')) applyAllDates(root);
    if (effects.includes('colours')) colourInputNick(root);
  }

  // ---------------------------------------------------------------------------
  // Settings panel (⚙ Settings at the right of the tab bar)
  // ---------------------------------------------------------------------------
  const TYPING_DELAY_MS = 200; // wait for a pause in typing before re-checking every shout

  function buildSettingsPanel(root) {
    const nav = findTabBar(root);
    if (!nav || nav.querySelector('.mamsb-settings')) return;

    // A plain <li> with no a[href], so jQuery UI doesn't treat it as a tab.
    const li = document.createElement('li');
    li.className = 'mamsb-settings';
    li.innerHTML = `
      <button type="button" class="mamsb-settings-btn" title="Shoutbox settings"
        aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke-width="3.6" stroke-dasharray="3.14 3.14" />
          <circle cx="12" cy="12" r="5" stroke-width="3.6" />
        </svg>
        <span>Settings</span>
      </button>
      <div class="mamsb-settings-panel" role="dialog" aria-label="Shoutbox settings" hidden>
        <div class="mamsb-settings-title">Shoutbox settings</div>
        <div class="mamsb-settings-cols">
          <section>
            <h4 class="mamsb-settings-heading">Messages</h4>
            <label title="Makes the shoutbox as tall as your browser window allows. Off: MaM's original, shorter height."><input type="checkbox" data-key="fillHeight"> Fit the shoutbox to the window height</label>
            <label title="After clicking Load Older, adds a line where the older shouts begin."><input type="checkbox" data-key="loadDivider"> Mark where older shouts were loaded</label>
            <label title="The full time, with seconds, still shows when you hover over it."><input type="checkbox" data-key="shortTimestamps"> Hide seconds in times (11:06)</label>
            <label title="Instead of dates like 2026-11-06. Older dates are written out in full."><input type="checkbox" data-key="friendlyDates"> Show dates as "Today" / "Yesterday"</label>
            <label title="Gives every other shout a slightly lighter background, so rows are easier to follow."><input type="checkbox" data-key="zebraRows"> Shade every other shout</label>
            <label class="mamsb-settings-range mamsb-settings-sub" data-depends="zebraRows"
              title="Always lighter than plain rows and darker than the shout under the mouse.">Shading strength
              <input type="range" min="${ZEBRA_MIN}" max="${ZEBRA_MAX}" step="0.5" data-key="zebraStrength"
                data-unit="%"><output></output>
            </label>
            <label data-desktop-only title="Draws a thin border around the shout your mouse is over."><input type="checkbox" data-key="hoverOutline"> Outline the shout under the mouse</label>
          </section>
          <section>
            <h4 class="mamsb-settings-heading">Names</h4>
            <label><input type="checkbox" data-key="showFlags"> Show country flags</label>
            <label><input type="checkbox" data-key="showUserIcons"> Show rank &amp; donor icons</label>
            <label title="Lightens (or darkens) a name colour only as much as needed to read it. Colours that already read well are left alone."><input type="checkbox" data-key="fixNickContrast"> Fix name colours that are hard to read</label>
            <label title="Some names, e.g. staff, have a coloured background. When off, that colour is used for the name text instead."><input type="checkbox" data-key="nickBackgrounds"> Keep coloured backgrounds behind names</label>
            <label class="mamsb-settings-range" data-desktop-only title="Names too long for the column fade out. Hover over a name to see it in full.">Name column
              <input type="range" min="${NICK_WIDTH_MIN}" max="${NICK_WIDTH_MAX}" step="5" data-key="nickColumnWidth" data-unit="px"><output></output>
            </label>
          </section>
          <section>
            <h4 class="mamsb-settings-heading">Message box &amp; full screen</h4>
            <label title="Shows who you're shouting as, at the start of the message box."><input type="checkbox" data-key="showInputNick"> Show your name in the box</label>
            <label data-desktop-only title="After using MaM's full-screen button, press Esc to shrink the shoutbox back."><input type="checkbox" data-key="escRestoresSize"> Press Esc to leave full-screen view</label>
            <label title="A touch-friendly layout when the shoutbox is full screen: bigger text and buttons, and the message box stays above the keyboard.">Mobile view
              <select data-key="mobileView">
                <option value="auto">On touch screens</option>
                <option value="always">Always</option>
                <option value="never">Never</option>
              </select>
            </label>
          </section>
          <section class="mamsb-settings-wide">
            <h4 class="mamsb-settings-heading">Highlights</h4>
            <label class="mamsb-settings-text" title="Shouts that mention any of these, or quote someone with one of these names, get a red tint. Not case-sensitive.">Highlight shouts that mention any of these words (separate with commas)
              <input type="text" data-key="highlightWords" placeholder="e.g. your username" spellcheck="false">
            </label>
          </section>
        </div>
        <div class="mamsb-settings-foot">
          <button type="button" class="mamsb-settings-reset">Reset to defaults</button>
          <button type="button" class="mamsb-settings-reset mamsb-diagnostics-btn"
            title="Collects how the page is styling the shoutbox, for reporting layout problems">Copy diagnostics</button>
          <button type="button" class="mamsb-settings-done">Done</button>
        </div>
      </div>`;
    nav.append(li);

    const button = li.querySelector('.mamsb-settings-btn');
    const panel = li.querySelector('.mamsb-settings-panel');
    const wordsInput = panel.querySelector('input[data-key="highlightWords"]');

    const showSliderValue = (slider) => {
      const output = slider.parentElement.querySelector('output');
      if (output) output.textContent = `${slider.value}${slider.dataset.unit || ''}`;
    };

    // Sub-options (e.g. shading strength) only show while their checkbox is on.
    const showDependentOptions = () => {
      for (const option of panel.querySelectorAll('[data-depends]')) {
        option.hidden = !settings[option.dataset.depends];
      }
    };

    /** Put the current settings into the panel's controls. */
    const fillControls = () => {
      for (const control of panel.querySelectorAll('[data-key]')) {
        const value = settings[control.dataset.key];
        if (control.type === 'checkbox') {
          control.checked = value;
        } else if (control === wordsInput) {
          // Don't rewrite the box while you're typing in it.
          if (document.activeElement !== control) control.value = value.join(', ');
        } else {
          control.value = value;
          if (control.type === 'range') showSliderValue(control);
        }
      }
      showDependentOptions();
    };

    const setOpen = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.classList.toggle('is-open', open);
      if (open) fillControls();
    };

    button.addEventListener('click', () => setOpen(panel.hidden));
    panel.querySelector('.mamsb-settings-done').addEventListener('click', () => setOpen(false));
    panel.querySelector('.mamsb-diagnostics-btn').addEventListener('click', () => {
      setOpen(false);
      collectDiagnostics(root);
    });
    document.addEventListener('click', (event) => {
      if (!panel.hidden && !li.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault(); // handled: don't also leave full-screen view
        setOpen(false);
        button.focus();
      }
    });

    let typingTimer = null;
    panel.addEventListener('input', (event) => {
      const control = event.target.closest('[data-key]');
      if (!control) return;
      const key = control.dataset.key;

      if (control.type === 'checkbox') {
        settings[key] = control.checked;
        showDependentOptions();
        saveSettings();
        applySettings(root, SETTING_EFFECTS[key] || []);
      } else if (control.type === 'range') {
        // Live preview while dragging; saved once you let go (see 'change' below).
        settings[key] = Number(control.value);
        showSliderValue(control);
        applyLayout(root);
      } else if (control.tagName === 'SELECT') {
        settings[key] = control.value;
        saveSettings();
        applySettings(root, SETTING_EFFECTS[key] || []);
      } else if (control === wordsInput) {
        settings[key] = control.value.split(',').map((word) => word.trim()).filter(Boolean);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
          saveSettings();
          applySettings(root, SETTING_EFFECTS[key]);
        }, TYPING_DELAY_MS);
      }
    });
    panel.addEventListener('change', (event) => {
      if (event.target.type === 'range') saveSettings();
    });

    panel.querySelector('.mamsb-settings-reset').addEventListener('click', () => {
      clearTimeout(typingTimer);
      settings = { ...DEFAULTS, highlightWords: [...DEFAULTS.highlightWords] };
      seedOwnName(); // the defaults include your username
      saveSettings();
      wordsInput.value = '';
      fillControls();
      applySettings(root);
    });

    // Keep other open MaM tabs in sync.
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      settings = loadSettings();
      fillControls();
      applySettings(root);
    });
  }

  // ---------------------------------------------------------------------------
  // Watching for new / changed shouts
  // ---------------------------------------------------------------------------
  function processAll(root) {
    root.querySelectorAll(SHOUT_SELECTOR).forEach(processShout);
    stripeShouts(root);
    applyAllDates(root);
  }

  /**
   * Give every other shout .mamsb-alt. Each shout keeps its stripe once it has
   * one; new shouts take the opposite of their neighbour (the one above for
   * shouts arriving at the bottom, the one below for Load Older at the top),
   * so the existing rows never swap.
   */
  function stripeShouts(root) {
    const shouts = [...root.querySelectorAll('#sbf .mamsb-msg')];
    if (!shouts.length) return;
    const striped = (shout) => 'mamsbStripe' in shout.dataset;
    const isAlt = (shout) => shout.dataset.mamsbStripe === 'alt';
    const setStripe = (shout, alt) => {
      shout.dataset.mamsbStripe = alt ? 'alt' : 'plain';
      shout.classList.toggle('mamsb-alt', alt);
    };

    if (!shouts.some(striped)) setStripe(shouts[0], false); // very first run
    for (let i = 1; i < shouts.length; i++) {
      if (!striped(shouts[i]) && striped(shouts[i - 1])) setStripe(shouts[i], !isAlt(shouts[i - 1]));
    }
    for (let i = shouts.length - 2; i >= 0; i--) {
      if (!striped(shouts[i]) && striped(shouts[i + 1])) setStripe(shouts[i], !isAlt(shouts[i + 1]));
    }
  }

  function onShoutboxMutations(mutations, root) {
    const shouts = new Set();
    const addedShouts = [];
    let newDateBreak = false;
    for (const mutation of mutations) {
      // A change inside an existing shout (e.g. MaM editing it).
      const changed = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
      const owner = changed?.closest(SHOUT_SELECTOR);
      if (owner) shouts.add(owner);
      // New shouts / date breaks.
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const added = node.matches(SHOUT_SELECTOR) ? [node] : [...node.querySelectorAll(SHOUT_SELECTOR)];
        added.forEach((shout) => shouts.add(shout));
        addedShouts.push(...added);
        if (node.matches('.dateBreak') || node.querySelector('.dateBreak')) newDateBreak = true;
      }
    }
    if (!shouts.size && !newDateBreak) return;

    shouts.forEach(processShout);
    stripeShouts(root);
    const clockChanged = learnFromLiveShouts(root, addedShouts);
    if (newDateBreak || clockChanged) applyAllDates(root);
    if (shouts.size) {
      colourInputNick(root);
      settleLoadOlder(root);
    }
  }

  /**
   * A small batch of shouts landing at the newest end of the list is MaM delivering
   * new shouts, so their time is "now" on MaM's clock. (Big batches are the
   * initial load or Load Older, and can be old.)
   */
  const LIVE_BATCH_MAX = 5;

  function learnFromLiveShouts(root, addedShouts) {
    if (!addedShouts.length || addedShouts.length > LIVE_BATCH_MAX || pendingLoad) return false;
    const newest = newestShout(root);
    if (!addedShouts.includes(newest)) return false;
    return learnMamClock(newest.querySelector(':scope > .ts'));
  }

  // ---------------------------------------------------------------------------
  // Setup, one feature at a time
  // ---------------------------------------------------------------------------
  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'mamsb-style';
    style.textContent = CSS;
    document.head.append(style);
  }

  function setUpReplies(root) {
    // Clicking a reply line (or Enter / Space on it) jumps to the quoted shout.
    // Clicking the name in it still opens their profile.
    root.addEventListener('click', (event) => {
      const reply = event.target.closest('.mamsb-reply');
      if (reply && !event.target.closest('a')) jumpToQuoted(root, reply);
    });
    root.addEventListener('keydown', (event) => {
      const reply = event.target.closest?.('.mamsb-reply');
      if (!reply || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      jumpToQuoted(root, reply);
    });
  }

  function setUpShoutMenu(root) {
    // Remember which ⋮ was clicked (capture phase, before MaM opens the menu).
    root.addEventListener(
      'click',
      (event) => {
        const clicked = event.target.closest('.sb_menu');
        if (!clicked) return;
        menuButton = clicked;
        setTimeout(positionMenu, 0);
      },
      true,
    );
    // MaM fills / shows the menu after the click; place it whenever that happens.
    const menu = root.querySelector('#sbMenuMain');
    if (menu) {
      new MutationObserver(positionMenu).observe(menu, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
      // MaM's menu layer only covers the shoutbox, so clicks elsewhere on the
      // page never reach it and the menu stays open. Pass those clicks on as a
      // click on the layer, which MaM treats as "close the menu".
      document.addEventListener('click', (event) => {
        if (isOpen('sbMenuMain') && !root.contains(event.target)) menu.click();
      });
    }
  }

  function setUpLoadOlder(root) {
    // Note your place before MaM's own click handler runs.
    root.addEventListener(
      'click',
      (event) => {
        if (event.target.closest('#loadMore, .loadMore')) startLoadOlder(root);
      },
      true,
    );
    // Once the older shouts are in place, scrolling yourself stops the re-checks.
    const list = root.querySelector('#sbf');
    for (const type of ['wheel', 'touchmove', 'keydown', 'mousedown']) {
      list?.addEventListener(
        type,
        () => {
          if (pendingLoad?.divider) clearPendingLoad();
        },
        { passive: true },
      );
    }
  }

  // More than this many height changes in a second means it isn't settling.
  const FIT_LOOP_LIMIT = 20;
  // Real shout traffic is a handful of batches a second, even with Load Older.
  const MUTATION_LOOP_LIMIT = 300;

  function setUpSizing(root) {
    fitGuard = new LoopGuard('fit height', FIT_LOOP_LIMIT, () => {
      root.classList.remove('mamsb-fill');
      showNotice(
        root,
        `"Fit the shoutbox to the window height" was paused: it kept re-sizing (window height ${window.innerHeight}px). ` +
          'Reload to try again, or turn it off in Settings.',
      );
    });
    maximised = isMaximised(root);
    // Re-fit when the window or anything in the shoutbox changes size. This
    // settles after one pass, since the list's new height doesn't change the
    // rest of the shoutbox.
    window.addEventListener('resize', () => fitHeight(root));
    new ResizeObserver(() => fitHeight(root)).observe(root);
    // MaM maximises / restores by changing #shoutbox's inline style. (Our own
    // --sb-list-h write lands here too, but fitHeight only writes when the
    // value changes, so it settles straight away.)
    new MutationObserver(() => onShoutboxStyleChange(root)).observe(root, {
      attributes: true,
      attributeFilter: ['style'],
    });
    // Remember the page position, but only while the shoutbox is normal size:
    // the jump caused by maximising mustn't overwrite it.
    window.addEventListener(
      'scroll',
      () => {
        if (maximised) return;
        pageScrollY = window.scrollY;
        pageScrollX = window.scrollX;
      },
      { passive: true },
    );
    // Scroll events can arrive a moment late, so also take the position at the
    // instant the ⛶ button is pressed (Esc and "📱 Mobile view" press it too),
    // before MaM moves anything.
    root.addEventListener(
      'click',
      (event) => {
        if (!event.target.closest('#sbFullToggle') || isMaximised(root)) return;
        pageScrollY = window.scrollY;
        pageScrollX = window.scrollX;
      },
      true,
    );
    // Device changes between mouse and touch (e.g. a tablet keyboard dock).
    coarsePointer.addEventListener('change', () => applyLayout(root));
    // Esc: bubble phase on document, so the settings panel and jQuery UI's
    // autocomplete (which both mark Esc as handled) get it first.
    document.addEventListener('keydown', (event) => onEscape(root, event));
  }

  function init(root) {
    if (root.classList.contains('mamsb')) return; // already running
    injectStyles();
    root.classList.add('mamsb');
    seedOwnName();
    buildMentionPattern();
    applyLayout(root);
    buildSettingsPanel(root);

    const input = root.querySelector('#shbox_text');
    if (input && !input.placeholder) input.placeholder = 'Message shoutbox';

    setUpReplies(root);
    setUpShoutMenu(root);
    setUpLoadOlder(root);
    setUpSizing(root);
    buildMobileControls(root);
    zoomPill.build(root);
    root.addEventListener('click', (event) => onMobileTap(root, event));
    updateMobileView(root); // in case the page loaded already full screen
    fitPageToScreen();
    window.addEventListener('load', fitPageToScreen, { once: true }); // images can widen the page

    processAll(root);
    buildInputNick(root);
    // Keep "Today" / "Yesterday" right if the page stays open past midnight.
    setInterval(() => applyAllDates(root), DATE_REFRESH_MS);
    const shoutObserver = new MutationObserver((mutations) => {
      if (mutationGuard.allow()) onShoutboxMutations(mutations, root);
    });
    const mutationGuard = new LoopGuard('restyling shouts', MUTATION_LOOP_LIMIT, () => {
      shoutObserver.disconnect();
      showNotice(root, 'Restyling new shouts was paused: it kept repeating. Reload the page to try again.');
    });
    shoutObserver.observe(root, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  const WAIT_FOR_SHOUTBOX_MS = 30000;
  const DATE_REFRESH_MS = 5 * 60 * 1000;
  const shoutbox = document.getElementById('shoutbox');
  if (shoutbox) {
    init(shoutbox);
  } else {
    // The shoutbox may be added to the page after load.
    const waiter = new MutationObserver(() => {
      const found = document.getElementById('shoutbox');
      if (found) {
        waiter.disconnect();
        init(found);
      }
    });
    waiter.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => waiter.disconnect(), WAIT_FOR_SHOUTBOX_MS);
  }
})();
