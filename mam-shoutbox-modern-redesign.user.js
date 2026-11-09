// ==UserScript==
// @name         MaM Shoutbox Modern Redesign
// @namespace    https://github.com/KAH-Rhyme/mam-shoutbox-modern-redesign
// @version      1.4.0
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
    /**
     * Keep MaM's ⋮ menu on each shout. Off: the shout's buttons are @ / ↩ / ✉
     * (send a PM), or ↩ / ✎ on your own shouts. Always on for staff, whose
     * extra tools are only in that menu.
     */
    shoutMenu: false,
    /** Show your own username at the start of the message box. */
    showInputNick: true,
    /** Show the emoji button between the message box and Shout. */
    emojiPicker: true,
    /** Skin tone for emoji that have one: 0 = default (yellow), 1–5 = light to dark. */
    emojiTone: 0,
    /** Show a SMILIES button (a searchable smilies picker) in place of MaM's Smilies tab. */
    smiliesButton: true,
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
    out.emojiTone = Number.isInteger(out.emojiTone) ? clamp(out.emojiTone, 0, 5) : DEFAULTS.emojiTone;
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
/* Colours and fonts, also used by MaM's suggestion lists (@ names, : smilies),
   which hang off <body> rather than #shoutbox. */
#shoutbox.mamsb,
.ui-autocomplete.mamsb-ac {
  --sb-bg-primary: hsl(240 6% 13%);
  --sb-bg-secondary: hsl(240 7% 16%);
  --sb-bg-tertiary: hsl(240 6% 23%);
  --sb-text: #e8e8e8;
  --sb-text-secondary: #a0a0a0;
  --sb-text-muted: #8a8a8a;
  --sb-accent: hsl(222 79% 59%);
  --sb-accent-hover: hsl(222 100% 68%);
  --sb-border: hsl(240 5% 26%);
  /* "Twemoji Mozilla" is only for emoji the fonts before it don't have: so
     Firefox on Windows shows flags in shouts, not letter pairs. */
  --sb-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Twemoji Mozilla", sans-serif;
  /* Firefox's own Twemoji Mozilla comes before Windows' Segoe UI Emoji, which
     has no flags (it draws them as letter pairs). Other browsers can't use it. */
  --sb-emoji-font: "Apple Color Emoji", "Twemoji Mozilla", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; /* = EMOJI_FONT */
}
#shoutbox.mamsb {
  --sb-nick-w: 130px;
  --sb-time-w: 38px;
  --sb-btn-w: 26px; /* each of the hover buttons (@ / ↩ / ⋮, or ✉ / ✎ in place of ⋮) */
  --sb-actions-w: calc(3 * var(--sb-btn-w) - 2px); /* three at most, borders overlapping */

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
  /* Room for three columns of options; placeSettings() narrows it to the
     shoutbox and stops it short of the message box (it scrolls beyond that). */
  width: var(--sb-settings-w, min(760px, calc(100vw - 32px)));
  max-height: var(--sb-settings-max-h, min(80vh, 640px));
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
/* A short note under an option (e.g. one that also needs a MaM preference) */
#shoutbox.mamsb .mamsb-settings-panel label:has(.mamsb-settings-note) { align-items: flex-start; }
#shoutbox.mamsb .mamsb-settings-panel label:has(.mamsb-settings-note) input { margin-top: 2px; }
#shoutbox.mamsb .mamsb-settings-note {
  display: block;
  margin-top: 1px;
  color: var(--sb-text-muted);
  font-size: 11.5px;
  line-height: 1.3;
}
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
/* Keep the first line clear of the hover buttons (76px wide at most, at the
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

/* Edited shouts: "(edited)" after the message, with the time it was edited in
   its tooltip (or shown on tap). The words come from CSS, not text in the
   page, so MaM's quote and the highlight check never see them. */
#shoutbox.mamsb .mamsb-edited::after {
  content: "(edited)";
  margin-left: 6px;
  color: var(--sb-text-muted);
  font-size: 11px;
  font-style: normal;
}
#shoutbox.mamsb .mamsb-edited[data-mamsb-peek]::after { content: "(" attr(data-mamsb-peek) ")"; }

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

/* Hover actions joined like a small toolbar: @mention · quote · menu, or
   with the menu off, @mention · quote · PM (others' shouts) and quote · edit
   (your own). */
#shoutbox.mamsb .mamsb-msg > :is(.sbAt, .sbNewQuote, .sb_menu, .mamsb-pm, .mamsb-edit) {
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
  font-family: inherit; /* ✎ is a <button>, which doesn't inherit it by default */
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s ease;
  /* Side by side from the right (slot 0 is rightmost), each overlapping the
     previous one's border. Which buttons show, in which slots, is set near
     the end of the stylesheet. */
  right: calc(12px + var(--mamsb-slot, 0) * (var(--sb-btn-w) - 1px));
  border-radius: var(--mamsb-corners, 0);
}
#shoutbox.mamsb .mamsb-msg > .sbAt::before { content: "@"; font-size: 13px; }
#shoutbox.mamsb .mamsb-msg > .sbNewQuote::before { content: "↩"; font-size: 13px; }
#shoutbox.mamsb .mamsb-msg > .mamsb-pm::before { content: "✉"; font-size: 13px; }
#shoutbox.mamsb .mamsb-msg > .mamsb-edit::before { content: "✎"; font-size: 13px; }
#shoutbox.mamsb .mamsb-msg > .sb_menu svg {
  width: 4px !important;
  height: 13px !important;
  fill: currentColor;
}
@media (hover: hover) {
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg:hover > :is(.sbAt, .sbNewQuote, .sb_menu, .mamsb-pm, .mamsb-edit) {
    opacity: 1;
    pointer-events: auto;
  }
}
/* Without a mouse, tap a shout to show its buttons (as in mobile view). */
@media (hover: none) {
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg.mamsb-tapped {
    background: rgba(255, 255, 255, var(--sb-hover)) !important;
  }
  #shoutbox.mamsb:where(:not(.mamsb-mobile)) .mamsb-msg.mamsb-tapped > :is(.sbAt, .sbNewQuote, .sb_menu, .mamsb-pm, .mamsb-edit) {
    opacity: 1;
    pointer-events: auto;
  }
}
#shoutbox.mamsb .mamsb-msg > :is(.sbAt, .sbNewQuote, .sb_menu, .mamsb-pm, .mamsb-edit):hover {
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
/* Shout has no left border of its own: that edge is the message box's right
   border, so light that up too. */
#shoutbox.mamsb #sbform:has(#shout_send:hover) #shbox_text {
  border-right-color: var(--sb-accent) !important;
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
/* ---- Emoji button and picker ----
   The button sits over the right-hand end of the message box, inside its
   border, so the box's own border runs round both. It has no border of its
   own: phone browsers' dark-mode recolouring treated a button's border
   differently from the text box's, which left a visible seam. */
/* MaM's div[id^="sb"] { overflow: hidden } (meant for shouts) also catches
   #sbform, which would cut off the picker that opens above it. */
#shoutbox.mamsb #sbform { position: relative !important; overflow: visible !important; }
#shoutbox.mamsb {
  --sb-emoji-w: 38px;
  --sb-smilies-w: 80px;
  /* how much of the box's right end each button takes (0 when turned off) */
  --sb-emoji-used: 0px;
  --sb-smilies-used: 0px;
}
#shoutbox.mamsb.mamsb-emoji-on { --sb-emoji-used: var(--sb-emoji-w); }
#shoutbox.mamsb.mamsb-smilies-on { --sb-smilies-used: var(--sb-smilies-w); }
#shoutbox.mamsb .mamsb-emoji-btn { display: none; }
#shoutbox#shoutbox.mamsb.mamsb-emoji-on #sbform > .mamsb-emoji-btn {
  position: relative;
  z-index: 1;
  display: flex;
  flex: none;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--sb-emoji-w);
  height: auto;
  /* pulled left over the box, stopping 1px short of its right border */
  margin: 1px 1px 1px calc(-1 * var(--sb-emoji-w) - 1px) !important;
  padding: 0 !important;
  background: none !important;
  color: var(--sb-text-muted) !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  cursor: pointer;
  transition: color 0.15s;
}
#shoutbox.mamsb:is(.mamsb-emoji-on, .mamsb-smilies-on) #shbox_text {
  padding-right: calc(var(--sb-emoji-used) + var(--sb-smilies-used) + 2px) !important;
}
/* SMILIES button: left of the emoji button, inside the box like it. A small
   outlined label, like the "GIF" button in chat apps. */
#shoutbox.mamsb .mamsb-smilies-btn { display: none; }
#shoutbox#shoutbox.mamsb.mamsb-smilies-on #sbform > .mamsb-smilies-btn {
  position: relative;
  z-index: 1;
  display: flex;
  flex: none;
  align-self: stretch;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--sb-smilies-w);
  height: auto;
  /* the first button pulls both back over the box's right end */
  margin: 1px 1px 1px calc(-1 * (var(--sb-smilies-used) + var(--sb-emoji-used)) - 1px) !important;
  padding: 0 !important;
  background: none !important;
  color: var(--sb-text-muted) !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  font-family: var(--sb-font) !important;
  cursor: pointer;
  transition: color 0.15s;
}
#shoutbox#shoutbox.mamsb.mamsb-smilies-on.mamsb-emoji-on #sbform > .mamsb-smilies-btn { margin-right: 0 !important; }
#shoutbox#shoutbox.mamsb.mamsb-smilies-on.mamsb-emoji-on #sbform > .mamsb-emoji-btn { margin-left: 0 !important; }
#shoutbox.mamsb .mamsb-smilies-btn:hover { color: var(--sb-text) !important; }
#shoutbox.mamsb .mamsb-smilies-btn.is-open { color: var(--sb-accent) !important; }
#shoutbox.mamsb .mamsb-smilies-btn:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: -3px; }
#shoutbox.mamsb .mamsb-smilies-chip {
  padding: 3px 6px;
  border: 1.5px solid currentColor;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}
#shoutbox.mamsb .mamsb-smilies-short { display: none; }
/* MaM's Smilies tab is replaced by the button; the rest of the tab bar stays */
#shoutbox#shoutbox.mamsb.mamsb-smilies-on > :is(#sbMenuTabs, .ui-tabs-nav) > li:is(#t-smilies, :has(> a[href="#smilies"])) {
  display: none !important;
}
#shoutbox.mamsb .mamsb-emoji-btn:hover { color: var(--sb-text) !important; }
#shoutbox.mamsb .mamsb-emoji-btn.is-open { color: var(--sb-accent) !important; }
#shoutbox.mamsb .mamsb-emoji-btn:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: -3px; }
#shoutbox.mamsb .mamsb-emoji-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
#shoutbox.mamsb .mamsb-emoji-btn .mamsb-emoji-eye { fill: currentColor; stroke: none; }

/* The picker: above the message box, right-aligned with it. emojiPicker.place()
   sets its height to fit inside the shoutbox. */
#shoutbox.mamsb .mamsb-emoji-picker {
  position: absolute;
  right: 16px;
  bottom: calc(100% + 4px);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 32px));
  height: var(--sb-emoji-h, 380px);
  background: var(--sb-bg-secondary);
  border: 1px solid var(--sb-border);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  color: var(--sb-text);
  font-family: var(--sb-font);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  cursor: default;
}
/* MaM's "Text and Smilies Entry: top": the message box is above the list */
#shoutbox.mamsb .mamsb-emoji-picker.is-below { top: calc(100% + 4px); bottom: auto; }
#shoutbox.mamsb .mamsb-emoji-picker[hidden],
#shoutbox.mamsb .mamsb-emoji-picker [hidden] { display: none !important; }
#shoutbox.mamsb .mamsb-emoji-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--sb-border);
}
/* The search box, with a × at its right end that clears it */
#shoutbox.mamsb .mamsb-emoji-search-wrap {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  --sb-clear-w: 26px;
}
#shoutbox.mamsb .mamsb-emoji-search {
  flex: 1;
  box-sizing: border-box;
  width: auto !important;
  min-width: 0;
  height: auto !important;
  margin: 0 !important;
  padding: 6px var(--sb-clear-w) 6px 8px !important;
  background: var(--sb-bg-primary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px;
  box-shadow: none !important;
  font-family: var(--sb-font) !important;
  font-size: 13px !important;
}
#shoutbox.mamsb .mamsb-emoji-search::placeholder { color: var(--sb-text-muted); }
#shoutbox.mamsb .mamsb-emoji-search:focus { outline: none; border-color: var(--sb-accent) !important; }
/* Our own ×, the same in every browser, instead of the browser's own */
#shoutbox.mamsb .mamsb-emoji-search::-webkit-search-cancel-button { display: none; -webkit-appearance: none; }
#shoutbox.mamsb .mamsb-emoji-clear {
  position: absolute;
  top: 1px;
  right: 1px;
  bottom: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--sb-clear-w);
  margin: 0 !important;
  padding: 0 !important;
  background: none !important;
  color: var(--sb-text-muted) !important;
  border: 0 !important;
  border-radius: 0 3px 3px 0;
  box-shadow: none !important;
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-emoji-clear:hover { color: var(--sb-text) !important; }
#shoutbox.mamsb .mamsb-emoji-clear:focus { outline: none; }
#shoutbox.mamsb .mamsb-emoji-clear:focus-visible { color: var(--sb-accent) !important; }
#shoutbox.mamsb .mamsb-emoji-clear svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}
/* Skin tones: a hand in each tone. Emoji rather than coloured dots, because
   phone browsers' dark-mode recolouring turned the light dots brown (it leaves
   emoji alone). The ring around the chosen one is the swatch's own border. */
#shoutbox.mamsb .mamsb-emoji-tones { display: flex; flex: none; gap: 1px; }
#shoutbox.mamsb .mamsb-emoji-tones button {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box !important;
  width: 26px;
  height: 26px;
  margin: 0 !important;
  padding: 0 !important;
  background: none !important;
  border: 1.5px solid transparent !important;
  border-radius: 50%;
  box-shadow: none !important;
  font-family: var(--sb-emoji-font) !important;
  font-size: 15px !important;
  line-height: 1 !important;
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-emoji-tones button:hover { border-color: var(--sb-border) !important; }
#shoutbox.mamsb .mamsb-emoji-tones button[aria-checked="true"] { border-color: var(--sb-text-secondary) !important; }
#shoutbox.mamsb .mamsb-emoji-tones button:focus { outline: none; }
#shoutbox.mamsb .mamsb-emoji-tones button:focus-visible { border-color: var(--sb-accent) !important; }
#shoutbox.mamsb .mamsb-emoji-list {
  position: relative; /* emoji positions are measured from here (arrow keys) */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 6px 6px;
}
#shoutbox.mamsb .mamsb-emoji-list::-webkit-scrollbar { width: 8px; }
#shoutbox.mamsb .mamsb-emoji-list::-webkit-scrollbar-track { background: var(--sb-bg-secondary); }
#shoutbox.mamsb .mamsb-emoji-list::-webkit-scrollbar-thumb { background: var(--sb-border); border-radius: 4px; }
#shoutbox.mamsb .mamsb-emoji-heading {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 4px 4px;
  background: var(--sb-bg-secondary);
  color: var(--sb-text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
#shoutbox.mamsb .mamsb-emoji-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
}
#shoutbox.mamsb .mamsb-emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border-radius: 4px;
  font-family: var(--sb-emoji-font);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
}
#shoutbox.mamsb .mamsb-emoji-item.is-active { background: var(--sb-bg-tertiary); }
#shoutbox.mamsb .mamsb-emoji-empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  color: var(--sb-text-muted);
}
/* Names the highlighted emoji; with none, explains Shift-click */
#shoutbox.mamsb .mamsb-emoji-foot {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border-top: 1px solid var(--sb-border);
  color: var(--sb-text-secondary);
  white-space: nowrap;
  overflow: hidden;
}
#shoutbox.mamsb .mamsb-emoji-foot.is-hint { color: var(--sb-text-muted); font-size: 12px; }
#shoutbox.mamsb .mamsb-emoji-foot-emoji { font-family: var(--sb-emoji-font); font-size: 22px; line-height: 1; }
#shoutbox.mamsb .mamsb-emoji-foot-name { overflow: hidden; text-overflow: ellipsis; }
#shoutbox.mamsb .mamsb-emoji-foot-name::first-letter { text-transform: uppercase; }

/* ---- Smilies picker ----
   Built from the emoji picker's panel (search, list, bottom strip), but as
   wide as the message box, like MaM's @ / : suggestion lists, with a grid of
   equal cells. smiliePicker.place() sets its position and size. */
#shoutbox.mamsb .mamsb-emoji-picker.mamsb-smilie-picker {
  right: auto;
  left: var(--sb-smilie-left, 16px);
  width: var(--sb-smilie-width, 360px);
}
#shoutbox.mamsb .mamsb-smilie-picker .mamsb-emoji-list { padding: 6px; }
#shoutbox.mamsb .mamsb-smilie-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  grid-auto-rows: 64px; /* every row the same height, whatever the smilies */
}
#shoutbox.mamsb .mamsb-smilie-item {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
  border-radius: 4px;
  cursor: pointer;
}
#shoutbox.mamsb .mamsb-smilie-item.is-active { background: var(--sb-bg-tertiary); }
/* Real size when it fits; bigger ones shrink to fit (never enlarged) */
#shoutbox.mamsb .mamsb-smilie-item img {
  display: block;
  width: auto !important;
  height: auto !important;
  max-width: calc(100% - 8px) !important;
  max-height: 56px !important;
  margin: 0 !important;
  border: 0 !important;
}
#shoutbox.mamsb .mamsb-smilie-picker .mamsb-emoji-foot { height: 60px; }
#shoutbox.mamsb .mamsb-smilie-picker .mamsb-emoji-foot-name::first-letter { text-transform: none; } /* codes exactly as typed */
#shoutbox.mamsb .mamsb-smilie-foot-pic img {
  display: block;
  width: auto !important;
  height: auto !important;
  max-width: 160px !important;
  max-height: 48px !important;
}

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
/* Action rows: rows above the user row that have an ID (Quote, Edit, Delete,
   and anything else MaM adds for staff). Rows without one are information:
   "Edited 12:34:56", and MaM's empty spacer rows, which are dropped. Only the
   actions this script knows get a plain symbol in place of MaM's GIF icon;
   anything else is left exactly as MaM draws it. */
#shoutbox.mamsb #sbMenuMain > ul > li:empty { display: none !important; }
#shoutbox.mamsb #sbMenuMain > ul > li[id]:has(~ #sbun) { cursor: pointer; }
#shoutbox.mamsb #sbMenuMain > ul > li[id]:has(~ #sbun):hover { background: var(--sb-bg-tertiary) !important; }
#shoutbox.mamsb #sbMenuMain > ul > li:not([id]):has(~ #sbun) {
  color: var(--sb-text-secondary);
  font-size: 12px;
}
#shoutbox.mamsb #sbMenuMain :is(#sbQuote, #sbEdit, #sbDel) { text-transform: capitalize; }
#shoutbox.mamsb #sbMenuMain :is(#sbQuote, #sbEdit, #sbDel) > img { display: none !important; }
#shoutbox.mamsb #sbMenuMain :is(#sbQuote, #sbEdit, #sbDel)::before {
  width: 1em;
  color: var(--sb-text-secondary);
  text-align: center;
}
#shoutbox.mamsb #sbMenuMain #sbQuote::before { content: "↩"; }
#shoutbox.mamsb #sbMenuMain #sbEdit::before { content: "✎"; }
#shoutbox.mamsb #sbMenuMain #sbDel::before { content: "✕"; }
/* User row: name, rank icon, PM link */
#shoutbox.mamsb #sbMenuMain #sbun {
  gap: 4px;
  border-top: 1px solid var(--sb-border);
  margin-top: 4px !important;
  padding-top: 10px !important;
  font-weight: 500;
}
#shoutbox.mamsb #sbMenuMain #sbun img { height: 14px !important; width: auto; }
/* The PM link. Only this one: any other links staff get in this row are left
   as MaM draws them, and follow it on the right. */
#shoutbox.mamsb #sbMenuMain #sbun > a[href^="/sendmessage.php"] {
  margin-left: auto;
  padding: 2px 4px;
  border-radius: 4px;
  opacity: 0.75;
}
#shoutbox.mamsb #sbMenuMain #sbun > a[href^="/sendmessage.php"]:hover { opacity: 1; background: var(--sb-bg-tertiary); }
/* Rank and custom title (the rows after the user row) */
#shoutbox.mamsb #sbMenuMain #sbun ~ li {
  padding-top: 0 !important;
  color: var(--sb-text-secondary);
  font-size: 12px;
}
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
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > :is(.sb_menu, .sbNewQuote, .sbAt, .mamsb-pm, .mamsb-edit) {
  top: 8px !important;
  bottom: auto !important;
  left: auto !important;
  right: calc(12px + var(--mamsb-slot, 0) * (var(--sb-btn-w) - 1px)) !important;
  width: var(--sb-btn-w) !important;
  height: 32px !important;
  border-radius: var(--mamsb-corners, 0) !important;
  align-content: normal !important;
}
/* The ⋮ menu: normal text sizes, and nothing behind the name */
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul { font-size: 15px !important; margin: 0 !important; }
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul * {
  font-size: inherit !important;
  line-height: 1.4 !important;
}
/* Information rows: rank and title (after the user row), "Edited …" (before it) */
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul > li:is(#sbun ~ li, :not([id]):has(~ #sbun)) { font-size: 13px !important; }
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
#shoutbox#shoutbox.mamsb.mamsb-mobile .mamsb-msg > :is(.sbAt, .sbNewQuote, .mamsb-pm) {
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

/* ---- MaM's suggestion lists (typing @name or :smilie) ----
   jQuery UI's autocomplete menus, restyled as a panel like the emoji picker.
   suggestionLists.place() pins them just above the message box (or edit box),
   as wide as it and no taller than the space inside the shoutbox. These
   !important rules outrank the top / left / width jQuery writes inline. */
.ui-autocomplete.mamsb-ac {
  position: fixed !important;
  top: var(--sb-ac-top, 0px) !important;
  left: var(--sb-ac-left, 0px) !important;
  right: auto !important;
  bottom: auto !important;
  transform: translateY(-100%); /* its bottom edge sits at --sb-ac-top */
  z-index: 100001 !important;
  box-sizing: border-box !important;
  width: var(--sb-ac-width, 300px) !important;
  max-height: var(--sb-ac-max-h, 400px) !important;
  margin: 0 !important;
  padding: 4px 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior: contain;
  list-style: none !important;
  background: var(--sb-bg-secondary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 4px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
  font-family: var(--sb-font) !important;
  font-size: 14px !important;
  line-height: 1.4 !important;
}
.ui-autocomplete.mamsb-ac.is-below { transform: none; } /* message box above the list: open downwards */
.ui-autocomplete.mamsb-ac::-webkit-scrollbar { width: 8px; }
.ui-autocomplete.mamsb-ac::-webkit-scrollbar-track { background: var(--sb-bg-secondary); }
.ui-autocomplete.mamsb-ac::-webkit-scrollbar-thumb { background: var(--sb-border); border-radius: 4px; }
.ui-autocomplete.mamsb-ac > .ui-menu-item {
  margin: 0 !important;
  padding: 0 !important;
  list-style: none !important;
  background: none !important;
  border: 0 !important;
}
.ui-autocomplete.mamsb-ac .ui-menu-item-wrapper {
  display: flex !important;
  align-items: center;
  gap: 10px;
  box-sizing: border-box !important;
  min-height: 32px;
  margin: 0 !important;
  padding: 4px 12px !important;
  background: none !important;
  color: var(--sb-text) !important;
  border: 0 !important;
  border-radius: 0 !important;
  font-weight: 400 !important;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* Highlighted row (mouse or ↑ ↓): the subtle grey of the emoji picker, in
   place of the theme's orange */
.ui-autocomplete.mamsb-ac .ui-menu-item-wrapper.ui-state-active {
  background: var(--sb-bg-tertiary) !important;
  border: 0 !important;
  margin: 0 !important;
}
/* Smilies: the picture (up to 48px tall) in a fixed-width column, then its code */
.ui-autocomplete.mamsb-ac .mamsb-ac-pic {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 72px;
}
.ui-autocomplete.mamsb-ac .mamsb-ac-pic img {
  display: block;
  width: auto !important;
  height: auto !important;
  max-width: 72px !important;
  max-height: 48px !important;
  margin: 0 !important;
  border: 0 !important;
}
.ui-autocomplete.mamsb-ac .mamsb-ac-code {
  min-width: 0;
  overflow: hidden;
  color: var(--sb-text-secondary);
  text-overflow: ellipsis;
}
.ui-autocomplete.mamsb-ac .ui-state-active .mamsb-ac-code { color: var(--sb-text); }
/* Mobile view: bigger rows to tap */
.ui-autocomplete.mamsb-ac.is-mobile { font-size: 16px !important; }
.ui-autocomplete.mamsb-ac.is-mobile .ui-menu-item-wrapper { min-height: 44px; padding: 6px 16px !important; }
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
/* "Latest ↓": shown once you've scrolled away from the newest shouts, in the
   list's corner nearest them (bottom right, or top right if newest-first).
   Same pill look as "Reset zoom". latestPill.place() positions it. */
#shoutbox.mamsb .mamsb-latest-pill {
  position: absolute !important;
  z-index: 5 !important;
  display: flex !important;
  align-items: center;
  margin: 0 !important;
  padding: 2px !important;
  background: var(--sb-bg-tertiary) !important;
  color: var(--sb-text) !important;
  border: 1px solid var(--sb-border) !important;
  border-radius: 999px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  font-family: var(--sb-font) !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1.2 !important;
  white-space: nowrap;
}
#shoutbox.mamsb .mamsb-latest-pill[hidden] { display: none !important; }
#shoutbox.mamsb .mamsb-latest-pill button {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 !important;
  padding: 4px 10px !important;
  background: none !important;
  color: inherit !important;
  border: 0 !important;
  border-radius: 999px !important;
  font: inherit !important;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
#shoutbox.mamsb .mamsb-latest-pill .mamsb-latest-go:hover { background: var(--sb-border) !important; }
#shoutbox.mamsb .mamsb-latest-pill .mamsb-latest-close {
  padding: 4px 8px !important;
  color: var(--sb-text-secondary) !important;
}
#shoutbox.mamsb .mamsb-latest-pill .mamsb-latest-close:hover { color: var(--sb-text) !important; }
#shoutbox.mamsb .mamsb-latest-pill button:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 1px; }
#shoutbox.mamsb .mamsb-latest-pill svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
#shoutbox.mamsb .mamsb-latest-pill .mamsb-latest-close svg { width: 10px; height: 10px; }
#shoutbox.mamsb .mamsb-latest-pill.is-up .mamsb-latest-go svg { transform: rotate(180deg); }
#shoutbox.mamsb.mamsb-mobile .mamsb-latest-pill { font-size: 15px !important; }
#shoutbox.mamsb.mamsb-mobile .mamsb-latest-pill button { padding: 8px 12px !important; }
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

/* Tap a shout to show its buttons (larger, for fingers) */
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.mamsb-tapped { background: rgba(255, 255, 255, var(--sb-hover)) !important; }
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > :is(.sbAt, .sbNewQuote, .sb_menu, .mamsb-pm, .mamsb-edit) {
  top: 8px; /* level with the name line */
  height: 32px;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.mamsb-tapped > :is(.sbAt, .sbNewQuote, .sb_menu, .mamsb-pm, .mamsb-edit) {
  opacity: 1;
  pointer-events: auto;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > :is(.sbAt, .sbNewQuote, .mamsb-pm, .mamsb-edit)::before { font-size: 17px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-msg > .sb_menu svg { width: 5px !important; height: 17px !important; }
#shoutbox.mamsb.mamsb-mobile #sbMenuMain > ul > li { padding: 12px 16px !important; font-size: 15px; }

/* Message box: 16px text stops iPhones zooming in when you tap it */
#shoutbox.mamsb.mamsb-mobile #sbform { padding: 8px !important; }
#shoutbox.mamsb.mamsb-mobile #shbox_text { font-size: 16px !important; }
/* Edit dialog: MaM gives it a fixed height when it opens, so when the
   keyboard then shrinks the shoutbox, the edit box was left behind the
   keyboard. Filling the shoutbox instead keeps it just above the keyboard,
   like the message box. */
#shoutbox#shoutbox.mamsb.mamsb-mobile #sbEditOverlay {
  top: 0 !important;
  bottom: 0 !important;
  height: auto !important;
}
#shoutbox.mamsb.mamsb-mobile #sbEditOverlay textarea { font-size: 16px !important; }
#shoutbox.mamsb.mamsb-mobile.mamsb-input-nick-on .mamsb-input-nick { max-width: 30vw; padding-left: 10px; font-size: 15px; }
#shoutbox.mamsb.mamsb-mobile #sbFullToggle,
#shoutbox.mamsb.mamsb-mobile .mamsb-mobile-btn { display: none !important; } /* use ✕ Exit instead */

/* Emoji picker: a sheet across the full width, just above the message box */
#shoutbox.mamsb.mamsb-mobile { --sb-emoji-w: 46px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-btn svg { width: 22px; height: 22px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-picker {
  left: 0;
  right: 0;
  bottom: 100%;
  width: auto;
  border-width: 1px 0 0;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  animation: mamsb-emoji-sheet 0.15s ease-out;
}
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-picker.is-below {
  top: 100%;
  bottom: auto;
  border-width: 0 0 1px;
  border-radius: 0 0 8px 8px;
  animation: none;
}
@keyframes mamsb-emoji-sheet {
  from { transform: translateY(24px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  #shoutbox.mamsb.mamsb-mobile .mamsb-emoji-picker { animation: none; }
}
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-head { gap: 10px; padding: 10px 12px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-search-wrap { --sb-clear-w: 40px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-clear svg { width: 15px; height: 15px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-search { padding: 8px var(--sb-clear-w) 8px 10px !important; font-size: 16px !important; } /* 16px: no iPhone zoom */
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-tones { gap: 2px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-tones button { width: 36px; height: 36px; border-width: 2px !important; font-size: 21px !important; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-list { padding: 0 8px 8px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-heading { padding: 10px 4px 6px; font-size: 12px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-grid { grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-item { height: 44px; font-size: 28px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-foot { display: none; } /* no hover or Shift on a phone */
/* Smilies: the button reads ":-)", the picker is the same full-width sheet */
#shoutbox.mamsb.mamsb-mobile { --sb-smilies-w: 50px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-smilies-full { display: none; }
#shoutbox.mamsb.mamsb-mobile .mamsb-smilies-short { display: inline; }
#shoutbox.mamsb.mamsb-mobile .mamsb-smilies-chip { padding: 4px 6px; font-size: 13px; letter-spacing: 0.02em; }
#shoutbox.mamsb.mamsb-mobile .mamsb-emoji-picker.mamsb-smilie-picker { left: 0; width: auto; }
#shoutbox.mamsb.mamsb-mobile .mamsb-smilie-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); grid-auto-rows: 60px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-smilie-item img { max-height: 52px !important; }

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
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-note { font-size: 13px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-panel input[type="checkbox"] { width: 20px; height: 20px; }
#shoutbox.mamsb.mamsb-mobile .mamsb-settings-panel [data-desktop-only] { display: none !important; }
/* Options that don't apply on a touch screen at all, even outside mobile view */
#shoutbox.mamsb:is(.mamsb-mobile, .mamsb-coarse) .mamsb-settings-panel [data-not-touch] { display: none !important; }
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
/* Settings that staff can't change (see shoutMenu) */
#shoutbox.mamsb.mamsb-staff .mamsb-settings-panel [data-not-staff] { display: none !important; }

/* ---- Which hover buttons a shout shows, and in which slot ----
   Kept last, and with the ID twice, so these win over the display pins above.
   With MaM's ⋮ menu (setting on, or staff):  @ ↩ ⋮
   Without it (.mamsb-lean):  others' shouts @ ↩ ✉, your own ↩ ✎, or just ↩
   once MaM no longer lets you edit. */
#shoutbox.mamsb .mamsb-msg > .sb_menu,
#shoutbox.mamsb .mamsb-msg > .mamsb-pm,
#shoutbox.mamsb .mamsb-msg > .mamsb-edit { --mamsb-slot: 0; --mamsb-corners: 0 4px 4px 0; }
#shoutbox.mamsb .mamsb-msg > .sbNewQuote { --mamsb-slot: 1; --mamsb-corners: 0; }
#shoutbox.mamsb .mamsb-msg > .sbAt { --mamsb-slot: 2; --mamsb-corners: 4px 0 0 4px; }
#shoutbox.mamsb.mamsb-lean .mamsb-msg.mamsb-own > .sbNewQuote { --mamsb-corners: 4px 0 0 4px; }
#shoutbox.mamsb.mamsb-lean .mamsb-msg.mamsb-own:not(.mamsb-can-edit) > .sbNewQuote { --mamsb-slot: 0; --mamsb-corners: 4px; }

#shoutbox#shoutbox.mamsb .mamsb-msg > a.mamsb-stand-in, /* the hidden name on "/me" shouts */
#shoutbox#shoutbox.mamsb .mamsb-msg > .mamsb-edit,
#shoutbox#shoutbox.mamsb:not(.mamsb-lean) .mamsb-msg > a.mamsb-pm,
#shoutbox#shoutbox.mamsb.mamsb-lean .mamsb-msg > .sb_menu,
#shoutbox#shoutbox.mamsb.mamsb-lean .mamsb-msg.mamsb-own > :is(.sbAt, a.mamsb-pm) { display: none !important; }
#shoutbox#shoutbox.mamsb.mamsb-lean .mamsb-msg:not(.mamsb-own) > a.mamsb-pm,
#shoutbox#shoutbox.mamsb.mamsb-lean .mamsb-msg.mamsb-own.mamsb-can-edit > .mamsb-edit { display: flex !important; }

/* Mobile view: a tapped shout shows the sender's rank and title beside their
   name (there's no hover tooltip on a touch screen). From CSS, so it isn't
   text in the shout. */
#shoutbox.mamsb.mamsb-mobile .mamsb-msg.mamsb-tapped > .mamsb-nick[data-mamsb-rank]::after {
  content: attr(data-mamsb-rank);
  margin-left: 8px;
  color: var(--sb-text-secondary);
  font-size: 13px;
  font-weight: 400;
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

  /** How far (px) the list is scrolled away from its newest shouts. */
  function distanceFromNewest(list) {
    return newestFirst() ? list.scrollTop : list.scrollHeight - list.scrollTop - list.clientHeight;
  }

  /** 'smooth', unless the system asks for reduced motion. */
  function scrollBehaviour() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  /** Run `change` (which alters the list's size) without losing your place at the newest shouts. */
  function keepingNewestInView(list, change) {
    if (!list.getClientRects().length) {
      change(); // hidden (other tab): nothing to keep in view
      return;
    }
    const wasAtNewest = distanceFromNewest(list) < AT_BOTTOM_SLACK;
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
  const SHOUT_PARTS =
    '.ts, .sb_menu, .sbNewQuote, .sbAt, .mamsb-nick, .mamsb-hide, .mamsb-reply, .mamsb-body, .mamsb-pm, .mamsb-edit';

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
    const isAction = shout.classList.contains('action');
    // "/me" shouts have their name moved into the text (below), but MaM's ⋮
    // looks for the name link right beside it and does nothing without one.
    // So leave a hidden copy where the name was.
    if (isAction) {
      const standIn = nameLink.cloneNode(true);
      standIn.classList.add('mamsb-hide', 'mamsb-stand-in');
      standIn.setAttribute('aria-hidden', 'true');
      standIn.tabIndex = -1;
      nameLink.before(standIn);
    }
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
    if (isAction) body.prepend(nameLink);

    const dotsButton = shout.querySelector(':scope > .sb_menu'); // MaM's ⋮
    addShoutButtons(shout, nameLink, dotsButton);
    addEditedLabel(body, dotsButton);
    addRank(nameLink, dotsButton);

    shout.classList.add('mamsb-msg');
    applyColours(shout);
    applyMention(shout);
  }

  // ---------------------------------------------------------------------------
  // What MaM's ⋮ menu offers, without the menu
  // ---------------------------------------------------------------------------
  // MaM puts everything its ⋮ menu shows on the ⋮ button itself, when it draws
  // the shout: data-ee (0 = no editing, 1 = you can edit, 2 = edit and delete,
  // which only staff get), data-et (when it was edited, in seconds), data-uc
  // (rank) and data-ut (custom title). The menu is only built from those when
  // clicked, so the script reads them straight from the button.

  // Shouts whose edit MaM refused (the time limit had passed), by ID, until
  // the page is reloaded. MaM's data-ee doesn't change once a shout is drawn.
  const refusedEdits = new Set();
  let ownUserId = '';
  let staffSeen = false; // set once a shout lets you delete it

  /** 0 = no editing, 1 = you can edit, 2 = edit and delete (staff). */
  function editLevel(dotsButton) {
    return Number(dotsButton?.dataset.ee) || 0;
  }

  /** ✉ and ✎, shown in place of the ⋮ when MaM's menu is off (see the CSS). */
  function addShoutButtons(shout, nameLink, dotsButton) {
    const uid = nameLink.getAttribute('href').match(/\d+/)[0];
    if (!ownUserId) ownUserId = currentUser().id;
    const level = editLevel(dotsButton);
    if (level === 2) staffSeen = true;
    // Your own shout: by your user ID, or (if the page header wasn't found)
    // because MaM lets you edit it and you're not staff.
    shout.classList.toggle('mamsb-own', ownUserId ? uid === ownUserId : level === 1);
    shout.classList.toggle('mamsb-can-edit', level > 0 && !refusedEdits.has(shout.id));

    const pm = document.createElement('a');
    pm.className = 'mamsb-pm';
    pm.href = `/sendmessage.php?receiver=${uid}`;
    pm.target = '_blank';
    pm.rel = 'noopener';
    pm.title = 'Send a PM';
    pm.setAttribute('aria-label', 'Send a PM');

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'mamsb-edit';
    edit.title = 'Edit';
    edit.setAttribute('aria-label', 'Edit');

    // After MaM's @, so MaM's quote (which reads the first link in the shout)
    // still finds its own ↩ first. They have no text of their own either.
    const after = shout.querySelector(':scope > .sbAt') || dotsButton;
    if (after) after.after(pm, edit);
    else nameLink.before(pm, edit);
  }

  /** "(edited)" after the message, with the time in its tooltip (MaM time, as in its menu). */
  function addEditedLabel(body, dotsButton) {
    const editedAt = Number(dotsButton?.dataset.et) || 0;
    if (editedAt <= 0) return;
    const time = new Date(editedAt * 1000).toISOString().slice(11, 19);
    const label = document.createElement('span');
    label.className = 'mamsb-edited';
    label.dataset.mamsbEditTime = time;
    label.title = `Edited ${time}`;
    body.append(label);
  }

  /** Rank and custom title, shown beside the name on a tapped shout in mobile view. */
  function addRank(nameLink, dotsButton) {
    // MaM writes these straight from its data, so a missing value can arrive
    // as the word "undefined" or "null".
    const parts = [dotsButton?.dataset.uc, dotsButton?.dataset.ut]
      .map((part) => (part || '').trim())
      .filter((part) => part && part !== 'undefined' && part !== 'null');
    if (parts.length) nameLink.dataset.mamsbRank = parts.join(' · ');
  }

  /** Staff keep MaM's ⋮ menu: their extra tools are only in there. */
  function isStaff() {
    return (
      staffSeen ||
      typeof window.showModNotesOnPage === 'function' ||
      typeof window.setup_shoutbox_sbbp === 'function'
    );
  }

  /** Show MaM's ⋮ menu, or ✉ / ✎ in its place. */
  function applyMenuMode(root) {
    const staff = isStaff();
    root.classList.toggle('mamsb-staff', staff);
    root.classList.toggle('mamsb-lean', !staff && !settings.shoutMenu);
  }

  // ✎ works through MaM's own menu, so MaM's edit box, checks and saving are
  // all unchanged: it opens the menu, clicks Edit and closes the menu again,
  // all before the page is next drawn, so the menu never shows.
  const EDIT_ANSWER_MS = 30000; // MaM's own timeout for that request
  let pendingEdit = null; // { id, until }: the edit MaM is fetching
  let editFromButton = false; // the edit box being opened came from ✎, not the ⋮ menu
  let editAnswersWatched = false;

  function editViaMenu(root, shout) {
    const dotsButton = shout.querySelector(':scope > .sb_menu');
    const menu = root.querySelector('#sbMenuMain');
    if (!dotsButton || !menu) return;
    watchEditAnswers();
    dotsButton.click(); // MaM builds its menu for this shout
    const edit = menu.querySelector('#sbEdit');
    if (edit) {
      pendingEdit = { id: shout.id.replace('sbid', ''), until: Date.now() + EDIT_ANSWER_MS };
      editFromButton = true;
      edit.click(); // MaM fetches the shout and opens its edit box
    } else {
      markEditRefused(shout.id);
    }
    // A click on the menu's own layer is MaM's "close the menu".
    if (!menu.classList.contains('hideMe')) menu.click();
  }

  function markEditRefused(shoutId) {
    refusedEdits.add(shoutId);
    document.getElementById(shoutId)?.classList.remove('mamsb-can-edit');
  }

  /**
   * When MaM refuses an edit (e.g. the time limit has passed), its answer to
   * the request it sends when you click Edit says so, and MaM shows that in an
   * Error box. Listen for that answer, through jQuery's events for the page's
   * own requests, and hide ✎ on that shout. This sends nothing itself.
   */
  function watchEditAnswers() {
    const jq = window.jQuery;
    if (editAnswersWatched || typeof jq !== 'function') return;
    editAnswersWatched = true;
    jq(document).on('ajaxComplete', (event, xhr, options) => {
      if (!pendingEdit) return;
      if (Date.now() > pendingEdit.until) {
        pendingEdit = null; // MaM gave up waiting by now, so this isn't its answer
        return;
      }
      if (!/\/shoutbox\/load\.php/.test(options?.url || '')) return;
      const sent = new URLSearchParams(typeof options.data === 'string' ? options.data : '');
      if (sent.get('id') !== pendingEdit.id) return;
      const { id } = pendingEdit;
      pendingEdit = null;
      const failure = xhr?.responseJSON?.failure;
      if (typeof failure === 'string' && failure !== '') {
        editFromButton = false; // no edit box opens
        markEditRefused(`sbid${id}`);
      }
    });
  }

  function setUpShoutButtons(root) {
    root.addEventListener('click', (event) => {
      const edit = event.target.closest('.mamsb-msg > .mamsb-edit');
      if (edit) {
        editViaMenu(root, edit.parentElement);
        return;
      }
      // You opened the real ⋮ menu yourself (the script's own clicks on it
      // aren't "trusted"): an edit from there should go back to the menu.
      if (event.isTrusted && event.target.closest('.sb_menu')) editFromButton = false;
      // Cancelling MaM's edit box brings its menu back (it expects you came
      // from there). When you came from ✎, close it again. MaM's own handler
      // on the button has run by the time the click reaches here.
      if (editFromButton && event.target.closest('#sbEditCancel')) {
        editFromButton = false;
        const menu = root.querySelector('#sbMenuMain');
        if (menu && !menu.classList.contains('hideMe')) menu.click();
      }
    });
    // Staff tools come from a separate MaM script that may load after this
    // one: look again a few times.
    for (const delay of [1000, 3000, 10000]) setTimeout(() => applyMenuMode(root), delay);
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
    list.scrollTo({ top: Math.max(0, top), behavior: scrollBehaviour() });

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

  /** "(edited)" → "(edited 17:43:56)" for a moment. */
  function peekEditTime(label) {
    label.dataset.mamsbPeek = `edited ${label.dataset.mamsbEditTime}`;
    clearTimeout(label.mamsbPeekTimer);
    label.mamsbPeekTimer = setTimeout(() => delete label.dataset.mamsbPeek, TIME_PEEK_MS);
  }

  // Devices with no mouse to hover with (phones, most tablets).
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
    const editedLabel = target.closest('.mamsb-edited');
    if (editedLabel) {
      peekEditTime(editedLabel);
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
    'tapped ✉ button': '#sbf .mamsb-msg.mamsb-tapped > .mamsb-pm',
    '⋮ menu box': '#sbMenuMain > ul',
    '⋮ menu name': '#sbMenuMain #sbun > span',
    'message form': '#sbform',
    'message input': '#shbox_text',
    'Shout button': '#shout_send',
    'emoji button': '.mamsb-emoji-btn',
    'smilies button': '.mamsb-smilies-btn',
    'skin tone swatch': '.mamsb-emoji-tones [data-tone="1"]',
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
   * where MaM sizes the list itself, and on touch screens, where the page is
   * zoomed and scrolled freely so "the window height" isn't a useful size.
   */
  const MIN_HEIGHT_CHANGE = 2; // px; smaller differences are rounding, not a real change
  let fitGuard = null; // created in setUpSizing (needs root for its notice)

  function fitHeight(root) {
    const list = root.querySelector('#sbf');
    if (!list) return;
    const enabled = settings.fillHeight && !coarsePointer.matches && !isMaximised(root) && !fitGuard?.tripped;

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
    applyMenuMode(root);
    root.classList.toggle('mamsb-emoji-on', settings.emojiPicker);
    if (!settings.emojiPicker) emojiPicker.close();
    root.classList.toggle('mamsb-smilies-on', settings.smiliesButton);
    if (settings.smiliesButton) {
      // The Smilies tab is hidden now: don't leave it as the open one.
      if (root.querySelector('#smilies')?.getClientRects().length) {
        findTabBar(root)?.querySelector('a[href="#sbf"]')?.click();
      }
    } else {
      smiliePicker.close();
    }
    root.style.setProperty('--sb-zebra', String(settings.zebraStrength / 100));
    root.style.setProperty('--sb-hover', String(HOVER_SHADE / 100));
    root.style.setProperty('--sb-nick-w', `${settings.nickColumnWidth}px`);
    root.style.setProperty('--sb-time-w', settings.shortTimestamps ? '38px' : '56px');
    root.classList.toggle('mamsb-touch', usesMobileView());
    root.classList.toggle('mamsb-coarse', coarsePointer.matches); // touch screen, whatever the Mobile view setting
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
            <label data-not-touch title="Makes the shoutbox as tall as your browser window allows. Off: MaM's original, shorter height."><input type="checkbox" data-key="fillHeight"> Fit the shoutbox to the window height</label>
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
            <label data-not-staff title="Off: each shout has ✉ to send a PM instead, and your own shouts have ✎ while MaM still lets you edit them. Staff always have the menu."><input type="checkbox" data-key="shoutMenu">
              <span>Show MaM's ⋮ menu on each shout<small class="mamsb-settings-note">In place of the ✉ and ✎ buttons</small></span></label>
          </section>
          <section>
            <h4 class="mamsb-settings-heading">Names</h4>
            <label title="MaM only sends flags if they're switched on in your MaM preferences."><input type="checkbox" data-key="showFlags">
              <span>Show country flags<small class="mamsb-settings-note">Also needs flags on in your MaM preferences</small></span></label>
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
            <label title="A button between the message box and Shout that opens a searchable list of emoji."><input type="checkbox" data-key="emojiPicker"> Emoji button</label>
            <label title="A SMILIES button next to the emoji button opens a searchable grid of MaM's smilies. Off: MaM's Smilies tab instead."><input type="checkbox" data-key="smiliesButton"> Smilies button (replaces the Smilies tab)</label>
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

    /**
     * As wide as three columns of options, but no wider than the shoutbox, and
     * no taller than the space down to the message box (or to the bottom of
     * the shoutbox, if the message box is at the top). Mobile view uses a
     * full-screen sheet instead.
     */
    const SETTINGS_MAX_W = 760;
    const SETTINGS_MIN_H = 200;
    const placeSettings = () => {
      if (panel.hidden || mobileViewActive) return;
      const rootBox = root.getBoundingClientRect();
      const width = Math.min(SETTINGS_MAX_W, rootBox.width - 24, window.innerWidth - 32);
      panel.style.setProperty('--sb-settings-w', `${Math.round(width)}px`);
      const top = panel.getBoundingClientRect().top;
      const formBox = root.querySelector('#sbform')?.getBoundingClientRect();
      const bottom = formBox && formBox.top > top ? formBox.top : rootBox.bottom;
      const height = Math.max(SETTINGS_MIN_H, bottom - top - 8);
      panel.style.setProperty('--sb-settings-max-h', `${Math.round(height)}px`);
    };
    window.addEventListener('resize', placeSettings);
    new ResizeObserver(placeSettings).observe(root);

    const setOpen = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.classList.toggle('is-open', open);
      if (open) {
        fillControls();
        placeSettings();
      }
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
    applyMenuMode(root); // a shout you can delete means you're staff
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

  // Parts of the shoutbox that never contain shouts: the script's own panels
  // and pills, and MaM's Smilies tab.
  const OWN_PARTS = '.mamsb-emoji-picker, .mamsb-settings, .mamsb-latest-pill, .mamsb-zoom-pill, #smilies';

  function isInOwnParts(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest(OWN_PARTS));
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
    applyMenuMode(root);
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
    // Before setUpSizing: its Esc handler (leave full screen) must come after ours.
    emojiPicker.build(root);
    smiliePicker.build(root); // after the emoji button, so it can sit to its left
    suggestionLists.setUp(root);

    const input = root.querySelector('#shbox_text');
    if (input && !input.placeholder) input.placeholder = 'Message shoutbox';

    setUpReplies(root);
    setUpShoutMenu(root);
    setUpShoutButtons(root);
    setUpLoadOlder(root);
    setUpSizing(root);
    buildMobileControls(root);
    zoomPill.build(root);
    latestPill.build(root);
    root.addEventListener('click', (event) => onMobileTap(root, event));
    updateMobileView(root); // in case the page loaded already full screen
    fitPageToScreen();
    window.addEventListener('load', fitPageToScreen, { once: true }); // images can widen the page

    processAll(root);
    buildInputNick(root);
    // Keep "Today" / "Yesterday" right if the page stays open past midnight.
    setInterval(() => applyAllDates(root), DATE_REFRESH_MS);
    const shoutObserver = new MutationObserver((mutations) => {
      // The pickers, Settings and pills change all the time as you use them,
      // and MaM's Smilies tab holds no shouts: don't let those count.
      const relevant = mutations.filter((mutation) => !isInOwnParts(mutation.target));
      if (relevant.length && mutationGuard.allow()) onShoutboxMutations(relevant, root);
    });
    const mutationGuard = new LoopGuard('restyling shouts', MUTATION_LOOP_LIMIT, () => {
      shoutObserver.disconnect();
      showNotice(root, 'Restyling new shouts was paused: it kept repeating. Reload the page to try again.');
    });
    shoutObserver.observe(root, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------------
  // Emoji picker: which emoji to offer (the ☺ button in the message box)
  // ---------------------------------------------------------------------------
  // Everything it needs is in this script: the emoji list is the EMOJI DATA
  // block below, and emoji are drawn with the system's own emoji font. It loads
  // nothing, and picking an emoji only types it into the message box.
  // Same list as --sb-emoji-font in the CSS.
  const EMOJI_FONT = '"Apple Color Emoji", "Twemoji Mozilla", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  // Each swatch is a raised hand in that tone.
  const SKIN_TONES = [
    { name: 'Default skin tone', hand: '\u270B' },
    { name: 'Light skin tone', hand: '\u270B\u{1F3FB}' },
    { name: 'Medium-light skin tone', hand: '\u270B\u{1F3FC}' },
    { name: 'Medium skin tone', hand: '\u270B\u{1F3FD}' },
    { name: 'Medium-dark skin tone', hand: '\u270B\u{1F3FE}' },
    { name: 'Dark skin tone', hand: '\u270B\u{1F3FF}' },
  ];

  /**
   * Which emoji this device can draw. Emoji newer than its emoji font show as
   * empty boxes, and combined emoji (👩‍💻, flags, skin tones) it doesn't know
   * fall apart into pieces, so both are left out of the picker.
   */
  const emojiSupport = {
    STORAGE_KEY: 'mamsb-emoji-support',
    // When the test can't run (e.g. a privacy setting blocks reading the test
    // drawing), show emoji up to this version, which nearly every current
    // system can draw.
    FALLBACK_VERSION: 13,
    // A combined emoji drawn wider than this many single emoji has fallen apart.
    MAX_WIDTH: 1.4,
    TEST_SIZE: 24, // px, the test drawing
    context: null,
    singleWidth: 0,

    /**
     * { version: newest emoji version to show, flags: can it draw flags }.
     * Tested once per browser version.
     */
    support() {
      const newestKnown = EMOJI_VERSION_TESTS[0]?.[0] ?? 0;
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || 'null');
      } catch {
        // ignore broken / unavailable storage
      }
      // Re-test after a browser update, or when this script's emoji list or fonts change.
      if (
        saved?.browser === navigator.userAgent &&
        saved.newestKnown === newestKnown &&
        saved.fonts === EMOJI_FONT &&
        typeof saved.flags === 'boolean'
      ) {
        return { version: saved.version, flags: saved.flags };
      }

      const result = this.test();
      // Not saved: try again next time. Flags stay in (at worst they show as letters).
      if (result === null) return { version: this.FALLBACK_VERSION, flags: true };
      try {
        localStorage.setItem(
          this.STORAGE_KEY,
          JSON.stringify({ browser: navigator.userAgent, newestKnown, fonts: EMOJI_FONT, ...result }),
        );
      } catch {
        // storage full or blocked; just test again next time
      }
      return result;
    },

    /**
     * { version: newest version whose test emoji draws in colour, flags: does
     * a flag draw in colour }, or null if the test can't be trusted. Windows'
     * own emoji font draws flags as two letters, which this catches.
     */
    test() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = this.TEST_SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.font = `${Math.round(this.TEST_SIZE * 0.75)}px ${EMOJI_FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        // A long-standing emoji must pass, or the drawings are being blocked or
        // altered and the test says nothing.
        if (!this.drawsInColour(context, '😀')) return null;
        const flags = this.drawsInColour(context, '\u{1F1EB}\u{1F1F7}'); // 🇫🇷
        for (const [version, emoji] of EMOJI_VERSION_TESTS) {
          if (this.drawsInColour(context, emoji)) return { version, flags };
        }
        return { version: 1, flags };
      } catch {
        return null; // canvas blocked
      }
    },

    /**
     * Draw the emoji in black and then in white. A colour emoji ignores the
     * text colour, so both drawings match; a missing one is drawn as a box (or
     * plain symbol) in the text colour, so they differ, or nothing is drawn.
     */
    drawsInColour(context, emoji) {
      const size = this.TEST_SIZE;
      const draw = (colour) => {
        context.clearRect(0, 0, size, size);
        context.fillStyle = colour;
        context.fillText(emoji, size / 2, size / 2);
        return context.getImageData(0, 0, size, size).data;
      };
      const onBlack = draw('#000');
      const onWhite = draw('#fff');
      let drawn = false;
      for (let i = 0; i < onBlack.length; i += 4) {
        for (let channel = 0; channel < 4; channel++) {
          if (onBlack[i + channel] !== onWhite[i + channel]) return false;
        }
        if (onBlack[i + 3] > 0) drawn = true;
      }
      return drawn;
    },

    /** Is this emoji drawn as one picture (not falling apart into pieces)? */
    drawsAsOne(emoji) {
      if ([...emoji.replace(/\uFE0F/g, '')].length === 1) return true; // nothing to fall apart
      try {
        if (!this.context) {
          this.context = document.createElement('canvas').getContext('2d');
          this.context.font = `20px ${EMOJI_FONT}`;
          this.singleWidth = this.context.measureText('😀').width;
        }
        if (!this.singleWidth) return true; // can't measure: keep it
        return this.context.measureText(emoji).width <= this.singleWidth * this.MAX_WIDTH;
      } catch {
        return true;
      }
    },
  };

  // Country flags (pairs of regional-indicator letters) and region flags such
  // as England's (a black flag plus hidden tag letters).
  const FLAG_SEQUENCE = /[\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}]/u;

  /** Lower-case words, for searching. */
  const searchWords = (text) => text.toLowerCase().split(/[\s_:,]+/).filter(Boolean);

  // ---------------------------------------------------------------------------
  // What the emoji and smilies pickers have in common
  // ---------------------------------------------------------------------------
  // Both are a panel by the message box: a search box, a scrolling grid of
  // items and a strip at the bottom naming the highlighted one. Each picker
  // object copies these methods in (...pickerBase) and adds its own build(),
  // open(), place(), buildList(), filter(), setActive() and pick(). Its own
  // state (items, active, …) is declared in the picker itself, not here, so the
  // two never share it.
  const PICK_SEVERAL_HINT = 'Shift-click or Shift+Enter to add several';
  const PICKER_MIN_HEIGHT = 160; // px

  /** On touch screens a picker waits for a tap on its search box: focusing it would open the keyboard over half the list. */
  function canFocusSearch() {
    return !mobileViewActive && !coarsePointer.matches;
  }

  const pickerBase = {
    /** The event handling both pickers share. `itemSelector` matches one item in the grid. */
    wireUp(input, itemSelector) {
      const { panel, button, search, list } = this;
      button.addEventListener('click', () => (panel.hidden ? this.open() : this.close()));
      input.addEventListener('focus', () => {
        this.inputUsed = true;
      });

      search.addEventListener('input', () => {
        this.filter();
        this.arrowKeysMoveInList = false;
        this.setActive(search.value.trim() ? this.visibleItems()[0] : null);
      });
      search.addEventListener('keydown', (event) => this.onSearchKey(event));
      // × clears the search and leaves you in the box to type a new one.
      panel.querySelector('.mamsb-emoji-clear').addEventListener('click', () => {
        search.value = '';
        this.filter();
        this.arrowKeysMoveInList = false;
        this.setActive(null);
        list.scrollTop = 0;
        search.focus({ preventScroll: true });
      });

      // Hovering highlights (and names) an item; clicking picks it.
      list.addEventListener('mousemove', (event) => {
        const el = event.target.closest(itemSelector);
        if (el && el !== this.active?.el) this.setActive(this.itemFor(el), { scroll: false });
      });
      list.addEventListener('click', (event) => {
        const el = event.target.closest(itemSelector);
        if (el) this.pick(this.itemFor(el), event.shiftKey);
      });

      // Keys typed in the picker are the picker's: don't let MaM's own
      // keyboard handlers on the message box area see them. Esc closes it.
      panel.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close({ backToInput: true });
        }
      });
      // Esc while the focus is somewhere else (e.g. back in the message box).
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden && !event.defaultPrevented) {
          event.preventDefault(); // handled: don't also leave full-screen view
          this.close({ backToInput: true });
        }
      });
      document.addEventListener('click', (event) => {
        if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) this.close();
      });

      // Keep it the right size as the shoutbox changes (window resized, on-screen
      // keyboard opening, mobile view switched on or off).
      const replace = () => {
        if (!panel.hidden) this.place();
      };
      new ResizeObserver(replace).observe(this.root);
      window.addEventListener('resize', replace);
    },

    /** Show the panel with an empty search. Each picker's open() gets its list ready first. */
    show() {
      this.search.value = '';
      this.filter();
      this.setActive(null);
      this.arrowKeysMoveInList = false;
      this.panel.hidden = false;
      this.button.setAttribute('aria-expanded', 'true');
      this.button.classList.add('is-open');
      this.place();
      this.list.scrollTop = 0;
      if (canFocusSearch()) this.search.focus({ preventScroll: true });
    },

    close({ backToInput = false } = {}) {
      if (!this.panel || this.panel.hidden) return;
      this.panel.hidden = true;
      this.button.setAttribute('aria-expanded', 'false');
      this.button.classList.remove('is-open');
      if (backToInput) this.root.querySelector('#shbox_text')?.focus({ preventScroll: true });
    },

    /**
     * Fit the panel's height into the shoutbox: above the message box (or
     * below it, if MaM's "Text and Smilies Entry: top" puts the box above the
     * list), at most `maxHeight` on desktop. Returns the message box area's box.
     */
    sizeToShoutbox(maxHeight) {
      const formBox = this.panel.parentElement.getBoundingClientRect();
      const rootBox = this.root.getBoundingClientRect();
      const listBox = this.root.querySelector('#sbf')?.getBoundingClientRect();
      const below = Boolean(listBox) && formBox.top < listBox.top;
      this.panel.classList.toggle('is-below', below);
      const room = below ? rootBox.bottom - formBox.bottom : formBox.top - rootBox.top;
      const wanted = mobileViewActive ? rootBox.height * 0.55 : maxHeight;
      const height = Math.max(PICKER_MIN_HEIGHT, Math.min(wanted, room - (mobileViewActive ? 0 : 8)));
      this.panel.style.setProperty('--sb-emoji-h', `${Math.round(height)}px`);
      return formBox;
    },

    itemFor(el) {
      return this.items[Number(el.dataset.index)];
    },

    visibleItems() {
      return this.items.filter((item) => !item.el.hidden);
    },

    /** Mark `item` as the highlighted one (null: none). Each picker's setActive() also fills in its bottom strip. */
    highlight(item) {
      this.column = null;
      this.active?.el.classList.remove('is-active');
      this.active?.el.removeAttribute('aria-selected');
      this.active = item || null;
      if (item) {
        item.el.classList.add('is-active');
        item.el.setAttribute('aria-selected', 'true');
        this.search.setAttribute('aria-activedescendant', item.el.id);
      } else {
        this.search.removeAttribute('aria-activedescendant');
      }
      this.panel.querySelector('.mamsb-emoji-foot').classList.toggle('is-hint', !item);
    },

    /** Scroll the list (only the list) to show `item`, keeping `clearance` px clear at the top (for a sticky heading). */
    scrollToItem(item, clearance = 0) {
      const list = this.list;
      const top = item.el.offsetTop;
      const bottom = top + item.el.offsetHeight;
      if (top - clearance < list.scrollTop) list.scrollTop = top - clearance;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    },

    /**
     * Keys in the search box. ↑ ↓ always move through the grid. ← → move the
     * text cursor while you're typing, and move through the grid once you've
     * started using ↑ ↓ (or if the search box is empty). Enter picks the
     * highlighted item (or the first), Shift+Enter keeps the picker open.
     */
    onSearchKey(event) {
      const visible = this.visibleItems();
      const move = (step) => {
        event.preventDefault();
        this.arrowKeysMoveInList = true;
        if (!visible.length) return;
        if (!this.active || !visible.includes(this.active)) {
          this.setActive(visible[0]);
          return;
        }
        if (step === 'up' || step === 'down') {
          // setActive() forgets the column, so carry it across.
          const column = this.column ?? this.active.el.offsetLeft;
          this.setActive(this.rowNeighbour(visible, step, column));
          this.column = column;
        } else {
          const index = visible.indexOf(this.active);
          this.setActive(visible[clamp(index + step, 0, visible.length - 1)]);
        }
      };
      switch (event.key) {
        case 'ArrowDown':
          move('down');
          break;
        case 'ArrowUp':
          move('up');
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          if (this.arrowKeysMoveInList || !this.search.value) move(event.key === 'ArrowLeft' ? -1 : 1);
          break;
        case 'Enter': {
          event.preventDefault();
          const item = this.active && !this.active.el.hidden ? this.active : visible[0];
          if (item) this.pick(item, event.shiftKey);
          break;
        }
        default:
      }
    },

    /** The item in the next row up / down whose position is closest to `column` (px from the left). */
    rowNeighbour(visible, direction, column) {
      const index = visible.indexOf(this.active);
      const top = this.active.el.offsetTop;
      const down = direction === 'down';
      let rowTop = null;
      let best = this.active;
      for (let i = index + (down ? 1 : -1); i >= 0 && i < visible.length; i += down ? 1 : -1) {
        const el = visible[i].el;
        if (rowTop === null) {
          if (down ? el.offsetTop <= top : el.offsetTop >= top) continue; // still on this row
          rowTop = el.offsetTop;
        } else if (el.offsetTop !== rowTop) {
          break; // past the row
        }
        if (best === this.active || Math.abs(el.offsetLeft - column) < Math.abs(best.el.offsetLeft - column)) {
          best = visible[i];
        }
      }
      return best;
    },

    /**
     * Type into the message box: where you left the cursor, or at the end if
     * you haven't been in the box yet. `makeText(value, start, end)` returns
     * what to insert there. Then close the picker, unless `keepOpen`.
     */
    typeIntoMessageBox(makeText, keepOpen) {
      const input = this.root.querySelector('#shbox_text');
      if (!input) return;
      let start = input.value.length;
      let end = start;
      if (this.inputUsed && input.selectionStart !== null) {
        start = input.selectionStart;
        end = input.selectionEnd;
      }
      const text = makeText(input.value, start, end);
      const limit = input.maxLength > 0 ? input.maxLength : Infinity;
      if (input.value.length - (end - start) + text.length > limit) return; // wouldn't fit
      input.setRangeText(text, start, end, 'end');
      this.inputUsed = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (!keepOpen) this.close({ backToInput: true });
      else if (canFocusSearch()) this.search.focus({ preventScroll: true });
    },
  };

  // ---------------------------------------------------------------------------
  // Emoji picker: the panel
  // ---------------------------------------------------------------------------
  const emojiPicker = {
    ...pickerBase,
    MAX_HEIGHT: 380, // px, on desktop
    root: null,
    button: null,
    panel: null,
    search: null,
    list: null,
    footName: null,
    footEmoji: null,
    items: [], // { el, emoji, name, words, tones } for every emoji shown
    built: false, // the list is built the first time the picker opens
    active: null, // the highlighted item
    arrowKeysMoveInList: false,
    column: null,
    inputUsed: false,
    shownTone: 0, // the skin tone the grid currently shows

    build(root) {
      const form = root.querySelector('#sbform');
      const send = form?.querySelector('#shout_send');
      const input = root.querySelector('#shbox_text');
      if (!send || !input || form.querySelector('.mamsb-emoji-btn')) return;
      this.root = root;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mamsb-emoji-btn';
      button.title = 'Emoji';
      button.setAttribute('aria-label', 'Emoji');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.2 14.2a4.6 4.6 0 0 0 7.6 0" />
          <circle class="mamsb-emoji-eye" cx="9" cy="9.8" r="1.2" />
          <circle class="mamsb-emoji-eye" cx="15" cy="9.8" r="1.2" />
        </svg>`;
      send.before(button);
      this.button = button;

      const panel = document.createElement('div');
      panel.className = 'mamsb-emoji-picker';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Emoji');
      panel.hidden = true;
      panel.innerHTML = `
        <div class="mamsb-emoji-head">
          <div class="mamsb-emoji-search-wrap">
            <input type="search" class="mamsb-emoji-search" placeholder="Search emoji" aria-label="Search emoji"
              role="combobox" aria-expanded="true" aria-controls="mamsb-emoji-list" aria-autocomplete="list"
              autocomplete="off" spellcheck="false">
            <button type="button" class="mamsb-emoji-clear" title="Clear search" aria-label="Clear search" hidden>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          </div>
          <div class="mamsb-emoji-tones" role="radiogroup" aria-label="Skin tone">
            ${SKIN_TONES.map(
              (tone, index) => `<button type="button" role="radio" data-tone="${index}" title="${tone.name}"
                aria-label="${tone.name}">${tone.hand}</button>`,
            ).join('')}
          </div>
        </div>
        <div class="mamsb-emoji-list" id="mamsb-emoji-list" role="listbox" aria-label="Emoji"></div>
        <div class="mamsb-emoji-empty" hidden>No emoji found</div>
        <div class="mamsb-emoji-foot" aria-hidden="true">
          <span class="mamsb-emoji-foot-emoji"></span>
          <span class="mamsb-emoji-foot-name"></span>
        </div>`;
      form.append(panel);
      this.panel = panel;
      this.search = panel.querySelector('.mamsb-emoji-search');
      this.list = panel.querySelector('.mamsb-emoji-list');
      this.footEmoji = panel.querySelector('.mamsb-emoji-foot-emoji');
      this.footName = panel.querySelector('.mamsb-emoji-foot-name');
      this.wireUp(input, '.mamsb-emoji-item');

      const tones = panel.querySelector('.mamsb-emoji-tones');
      tones.addEventListener('click', (event) => {
        const swatch = event.target.closest('[data-tone]');
        if (swatch) this.setTone(Number(swatch.dataset.tone), swatch);
      });
      tones.addEventListener('keydown', (event) => {
        const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const tone = (settings.emojiTone + step + SKIN_TONES.length) % SKIN_TONES.length;
        this.setTone(tone, tones.querySelector(`[data-tone="${tone}"]`));
      });
    },

    open() {
      if (!this.panel || !settings.emojiPicker) return;
      smiliePicker.close();
      if (!this.built) this.buildList();
      this.showTone();
      this.show();
    },

    place() {
      this.sizeToShoutbox(this.MAX_HEIGHT);
    },

    /** Build the grid, leaving out emoji this device can't draw. */
    buildList() {
      const { version: maxVersion, flags } = emojiSupport.support();
      const fragment = document.createDocumentFragment();
      let grid = null;
      let sectionCount = 0;
      for (const row of emojiData()) {
        if (typeof row === 'string') {
          const section = document.createElement('div');
          section.className = 'mamsb-emoji-section';
          section.setAttribute('role', 'group');
          const heading = document.createElement('div');
          heading.className = 'mamsb-emoji-heading';
          heading.id = `mamsb-emoji-heading-${sectionCount++}`;
          heading.textContent = row;
          section.setAttribute('aria-labelledby', heading.id);
          grid = document.createElement('div');
          grid.className = 'mamsb-emoji-grid';
          section.append(heading, grid);
          fragment.append(section);
          continue;
        }
        const [emoji, version, name, extraWords, toneList] = row;
        if (version > maxVersion || !emojiSupport.drawsAsOne(emoji)) continue;
        if (!flags && FLAG_SEQUENCE.test(emoji)) continue; // country / region flags this device draws as letters
        const el = document.createElement('span');
        el.className = 'mamsb-emoji-item';
        el.id = `mamsb-emoji-${this.items.length}`;
        el.setAttribute('role', 'option');
        el.setAttribute('aria-label', name);
        el.dataset.index = String(this.items.length);
        el.textContent = emoji;
        grid.append(el);
        this.items.push({
          el,
          emoji,
          name,
          words: ` ${[...searchWords(name), ...searchWords(extraWords)].join(' ')}`,
          // Tones this device can't draw as one picture fall back to the default.
          tones: toneList?.split(' ').map((variant) => (emojiSupport.drawsAsOne(variant) ? variant : emoji)),
        });
      }
      // Sections left empty (e.g. flags on Windows) aren't shown.
      for (const empty of fragment.querySelectorAll('.mamsb-emoji-section')) {
        if (!empty.querySelector('.mamsb-emoji-item')) empty.remove();
      }
      this.list.append(fragment);
      this.shownTone = 0; // the grid starts with the default (yellow) emoji
      this.built = true;
    },

    /** Show only emoji whose name or search words start with every word typed. */
    filter() {
      this.panel.querySelector('.mamsb-emoji-clear').hidden = !this.search.value;
      const query = searchWords(this.search.value.replace(/^:/, ''));
      const searching = query.length > 0;
      for (const item of this.items) {
        const show = !searching || query.every((word) => item.words.includes(` ${word}`));
        if (item.el.hidden === show) item.el.hidden = !show;
      }
      // Results keep their section headings; sections with no results are hidden.
      let any = false;
      for (const section of this.list.querySelectorAll('.mamsb-emoji-section')) {
        const hasResults = Boolean(section.querySelector('.mamsb-emoji-item:not([hidden])'));
        section.hidden = !hasResults;
        any ||= hasResults;
      }
      this.panel.querySelector('.mamsb-emoji-empty').hidden = any;
      this.list.hidden = !any;
      if (searching) this.list.scrollTop = 0;
    },

    /** Highlight an item (null: none) and name it in the bottom strip. */
    setActive(item, { scroll = true } = {}) {
      this.highlight(item);
      this.footEmoji.textContent = item ? item.el.textContent : '';
      this.footName.textContent = item ? item.name : PICK_SEVERAL_HINT;
      if (item && scroll) {
        // Keep it clear of the section heading stuck to the top of the list.
        const heading = this.list.querySelector('.mamsb-emoji-section:not([hidden]) .mamsb-emoji-heading');
        this.scrollToItem(item, heading?.offsetHeight || 0);
      }
    },

    /** Type the emoji into the message box. Shift keeps the picker open. */
    pick(item, keepOpen) {
      this.typeIntoMessageBox(() => item.el.textContent, keepOpen);
    },

    setTone(tone, swatch) {
      settings.emojiTone = tone;
      saveSettings();
      this.showTone();
      swatch?.focus();
    },

    /** Show the chosen skin tone on the swatches and on every emoji that has one. */
    showTone() {
      const tone = settings.emojiTone;
      for (const swatch of this.panel.querySelectorAll('[data-tone]')) {
        const chosen = Number(swatch.dataset.tone) === tone;
        swatch.setAttribute('aria-checked', String(chosen));
        swatch.tabIndex = chosen ? 0 : -1;
      }
      if (tone === this.shownTone) return; // the grid already shows it
      this.shownTone = tone;
      for (const item of this.items) {
        if (item.tones) item.el.textContent = tone ? item.tones[tone - 1] : item.emoji;
      }
      if (this.active) this.footEmoji.textContent = this.active.el.textContent;
    },
  };

  // ---------------------------------------------------------------------------
  // Smilies picker (the SMILIES button, replacing MaM's Smilies tab)
  // ---------------------------------------------------------------------------
  // A searchable grid of MaM's smilies, read from the (hidden) Smilies tab so
  // it always matches MaM's own list and order. The pictures are MaM's own
  // files, the same ones that tab uses.
  //
  // MaM only fills the Smilies tab the first time it's opened. With the tab
  // hidden, the picker asks MaM to do that (the same as clicking the tab),
  // and fills in as soon as the smilies arrive.
  const smiliePicker = {
    ...pickerBase,
    MAX_HEIGHT: 400, // px, on desktop
    LOAD_TIMEOUT_MS: 8000, // stop saying "Loading…" after this
    loadStarted: 0, // when we last asked MaM for its smilies
    root: null,
    button: null,
    panel: null,
    search: null,
    list: null,
    footPic: null,
    footName: null,
    items: [], // { el, code, search }
    built: false,
    active: null,
    arrowKeysMoveInList: false,
    column: null,
    inputUsed: false,

    build(root) {
      const form = root.querySelector('#sbform');
      const send = form?.querySelector('#shout_send');
      const input = root.querySelector('#shbox_text');
      if (!send || !input || form.querySelector('.mamsb-smilies-btn')) return;
      this.root = root;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mamsb-smilies-btn';
      button.title = 'Smilies';
      button.setAttribute('aria-label', 'Smilies');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML =
        '<span class="mamsb-smilies-chip" aria-hidden="true">' +
        '<span class="mamsb-smilies-full">Smilies</span><span class="mamsb-smilies-short">:-)</span>' +
        '</span>';
      // Left of the emoji button (or of Shout, if there isn't one).
      (form.querySelector('.mamsb-emoji-btn') || send).before(button);
      this.button = button;

      const panel = document.createElement('div');
      // Shares the emoji picker's panel styles (.mamsb-emoji-*).
      panel.className = 'mamsb-emoji-picker mamsb-smilie-picker';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Smilies');
      panel.hidden = true;
      panel.innerHTML = `
        <div class="mamsb-emoji-head">
          <div class="mamsb-emoji-search-wrap">
            <input type="search" class="mamsb-emoji-search" placeholder="Search smilies" aria-label="Search smilies"
              role="combobox" aria-expanded="true" aria-controls="mamsb-smilie-list" aria-autocomplete="list"
              autocomplete="off" spellcheck="false">
            <button type="button" class="mamsb-emoji-clear" title="Clear search" aria-label="Clear search" hidden>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          </div>
        </div>
        <div class="mamsb-emoji-list" id="mamsb-smilie-list" role="listbox" aria-label="Smilies">
          <div class="mamsb-smilie-grid"></div>
        </div>
        <div class="mamsb-emoji-empty" hidden>No smilies found</div>
        <div class="mamsb-emoji-foot" aria-hidden="true">
          <span class="mamsb-smilie-foot-pic"></span>
          <span class="mamsb-emoji-foot-name"></span>
        </div>`;
      form.append(panel);
      this.panel = panel;
      this.search = panel.querySelector('.mamsb-emoji-search');
      this.list = panel.querySelector('.mamsb-emoji-list');
      this.footPic = panel.querySelector('.mamsb-smilie-foot-pic');
      this.footName = panel.querySelector('.mamsb-emoji-foot-name');
      this.wireUp(input, '.mamsb-smilie-item');

      // MaM fills (or refills) the Smilies tab: pick up the new list.
      const tab = root.querySelector('#smilies');
      if (tab) {
        new MutationObserver(() => {
          if (!panel.hidden) this.refresh();
        }).observe(tab, { childList: true, subtree: true });
      }
    },

    /** Smilies currently in MaM's Smilies tab. */
    sources() {
      return this.root.querySelectorAll('#smilies img[data-ssps]');
    },

    /**
     * Ask MaM to fill its Smilies tab, as clicking the tab would: open it and
     * switch straight back, in one go so nothing visibly changes.
     */
    requestLoad() {
      // Once at a time; ask again if an earlier request never arrived.
      if (this.loadStarted && Date.now() - this.loadStarted < this.LOAD_TIMEOUT_MS) return;
      this.loadStarted = Date.now();
      // Change "Loading smilies…" to "No smilies found" if nothing arrives.
      setTimeout(() => {
        if (!this.panel.hidden) this.filter();
      }, this.LOAD_TIMEOUT_MS);
      const nav = findTabBar(this.root);
      const smiliesTab = nav?.querySelector('a[href="#smilies"]');
      const shoutsTab = nav?.querySelector('a[href="#sbf"]');
      if (!smiliesTab || !shoutsTab) return;
      smiliesTab.click();
      shoutsTab.click();
    },

    /** Rebuild if MaM's list has changed, and update what's shown. */
    refresh() {
      if (this.sources().length === this.items.length) return;
      this.buildList();
      this.filter();
      this.setActive(this.search.value.trim() ? this.visibleItems()[0] : null);
    },

    open() {
      if (!this.panel || !settings.smiliesButton) return;
      emojiPicker.close();
      if (!this.sources().length) this.requestLoad();
      if (!this.built || this.sources().length !== this.items.length) this.buildList();
      this.show();
    },

    /** As wide as the message box and lined up with it. */
    place() {
      const formBox = this.sizeToShoutbox(this.MAX_HEIGHT);
      const input = this.root.querySelector('#shbox_text');
      if (!input) return;
      const inputBox = input.getBoundingClientRect();
      this.panel.style.setProperty('--sb-smilie-left', `${Math.round(inputBox.left - formBox.left)}px`);
      this.panel.style.setProperty('--sb-smilie-width', `${Math.round(inputBox.width)}px`);
    },

    /** One cell per smilie in MaM's Smilies tab, in its order. */
    buildList() {
      const grid = this.panel.querySelector('.mamsb-smilie-grid');
      grid.replaceChildren();
      this.items = [];
      this.active = null;
      const fragment = document.createDocumentFragment();
      const seen = new Set();
      for (const source of this.sources()) {
        const code = source.dataset.ssps;
        if (!code || seen.has(code)) continue;
        seen.add(code);
        const el = document.createElement('span');
        el.className = 'mamsb-smilie-item';
        el.id = `mamsb-smilie-${this.items.length}`;
        el.setAttribute('role', 'option');
        el.setAttribute('aria-label', code);
        el.dataset.index = String(this.items.length);
        const picture = document.createElement('img');
        picture.src = source.getAttribute('src');
        picture.alt = '';
        picture.loading = 'lazy';
        picture.decoding = 'async';
        el.append(picture);
        fragment.append(el);
        this.items.push({ el, code, search: code.toLowerCase() });
      }
      grid.append(fragment);
      this.built = true;
    },

    /** Show only smilies whose code contains what's typed (anywhere, so "love" finds :love073:). */
    filter() {
      const query = this.search.value.trim().toLowerCase();
      this.panel.querySelector('.mamsb-emoji-clear').hidden = !this.search.value;
      let any = false;
      for (const item of this.items) {
        const show = !query || item.search.includes(query);
        if (item.el.hidden === show) item.el.hidden = !show;
        any ||= show;
      }
      const empty = this.panel.querySelector('.mamsb-emoji-empty');
      empty.hidden = any;
      // Still waiting for MaM to send its smilies?
      const loading = !this.items.length && this.loadStarted && Date.now() - this.loadStarted < this.LOAD_TIMEOUT_MS;
      empty.textContent = loading ? 'Loading smilies…' : 'No smilies found';
      this.list.hidden = !any;
      if (query) this.list.scrollTop = 0;
    },

    /** Highlight an item (null: none) and show it larger, with its code, in the bottom strip. */
    setActive(item, { scroll = true } = {}) {
      this.highlight(item);
      if (item) {
        const preview = item.el.querySelector('img').cloneNode();
        preview.loading = 'eager';
        this.footPic.replaceChildren(preview);
        this.footName.textContent = item.code;
        if (scroll) this.scrollToItem(item);
      } else {
        this.footPic.replaceChildren();
        this.footName.textContent = PICK_SEVERAL_HINT;
      }
    },

    /**
     * Type the code into the message box, with the spaces MaM needs around it
     * to recognise a smilie. Shift keeps the picker open.
     */
    pick(item, keepOpen) {
      this.typeIntoMessageBox((value, start, end) => {
        const before = start > 0 && !/\s/.test(value[start - 1]) ? ' ' : '';
        const after = /\s/.test(value[end] || '') ? '' : ' ';
        return `${before}${item.code}${after}`;
      }, keepOpen);
    },
  };

  // ---------------------------------------------------------------------------
  // "Latest" pill: back to the newest shouts
  // ---------------------------------------------------------------------------
  // Once you scroll away from the newest shouts (so new ones no longer bring
  // the list along), a pill in the list's corner nearest them jumps back.
  // Works with either Shoutbox Order: newest at the bottom or at the top.
  const latestPill = {
    SHOW_AFTER: 80, // px away from the newest shouts before it appears
    INSET: 12, // px from the list's edges
    SCROLLBAR: 8, // px, so it clears the list's scrollbar
    root: null,
    pill: null,
    frame: 0,
    dismissed: false, // closed with ×: stays away until you're back at the newest shouts

    build(root) {
      const list = root.querySelector('#sbf');
      if (!list || root.querySelector('.mamsb-latest-pill')) return;
      this.root = root;
      const pill = document.createElement('div');
      pill.className = 'mamsb-latest-pill';
      pill.hidden = true;
      pill.innerHTML = `
        <button type="button" class="mamsb-latest-go" title="Jump to the newest shouts">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" /></svg><span>Latest</span>
        </button>
        <button type="button" class="mamsb-latest-close" title="Dismiss" aria-label="Dismiss">
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
        </button>`;
      pill.querySelector('.mamsb-latest-go').addEventListener('click', () => this.jump());
      // Hidden until you're next back at the newest shouts; then it can appear again.
      pill.querySelector('.mamsb-latest-close').addEventListener('click', () => {
        this.dismissed = true;
        pill.hidden = true;
      });
      root.append(pill);
      this.pill = pill;

      const update = () => this.schedule();
      list.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      new ResizeObserver(update).observe(root);
      // New shouts, Load Older, and switching between the Shoutbox / Smilies tabs.
      new MutationObserver(update).observe(list, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
      update();
    },

    /** At most once per frame: scrolling fires very often. */
    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.update();
      });
    },

    update() {
      const list = this.root.querySelector('#sbf');
      const away = Boolean(list?.getClientRects().length) && distanceFromNewest(list) > this.SHOW_AFTER;
      if (!away) this.dismissed = false;
      const show = away && !this.dismissed;
      this.pill.hidden = !show;
      if (show) this.place(list);
    },

    /** In the list's corner nearest the newest shouts. */
    place(list) {
      const up = newestFirst();
      this.pill.classList.toggle('is-up', up);
      const parent = this.pill.offsetParent || document.body;
      const parentBox = parent.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      const offsetX = parent.scrollLeft - parent.clientLeft - parentBox.left;
      const offsetY = parent.scrollTop - parent.clientTop - parentBox.top;
      const left = listBox.right - this.INSET - this.SCROLLBAR - this.pill.offsetWidth + offsetX;
      const top = up
        ? listBox.top + this.INSET + offsetY
        : listBox.bottom - this.INSET - this.pill.offsetHeight + offsetY;
      this.pill.style.left = `${Math.round(left)}px`;
      this.pill.style.top = `${Math.round(top)}px`;
    },

    jump() {
      const list = this.root.querySelector('#sbf');
      if (!list) return;
      list.scrollTo({ top: newestFirst() ? 0 : list.scrollHeight, behavior: scrollBehaviour() });
    },
  };

  // ---------------------------------------------------------------------------
  // MaM's suggestion lists (typing @name or :smilie in the message / edit box)
  // ---------------------------------------------------------------------------
  // MaM fills these with jQuery UI's autocomplete, which hangs the list off
  // <body> at full size: hundreds of full-size smilies could run far off the
  // page. MaM still does the matching, keyboard handling (↑ ↓ Enter Tab Esc)
  // and inserting; this only restyles the list and keeps it inside the
  // shoutbox, just above the box you're typing in.
  const suggestionLists = {
    GAP: 4, // px between the list and the box
    MAX_HEIGHT: 400, // px, on desktop
    MIN_HEIGHT: 120, // px; below this, use whichever side has more room
    LIST_BG_RGB: [38, 38, 44], // --sb-bg-secondary, for name-colour contrast
    root: null,
    lists: new Set(), // every autocomplete <ul> seen so far
    shown: null, // the one currently open, if it's ours

    setUp(root) {
      this.root = root;
      for (const list of document.querySelectorAll('body > ul.ui-autocomplete')) this.watch(list);
      // jQuery UI creates each list the first time it's needed.
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && node.matches('ul.ui-autocomplete')) this.watch(node);
          }
        }
      }).observe(document.body, { childList: true });

      const replace = () => {
        if (this.shown) this.place(this.shown);
      };
      window.addEventListener('resize', replace);
      window.addEventListener('scroll', replace, { capture: true, passive: true });
      window.visualViewport?.addEventListener('resize', replace);
      new ResizeObserver(replace).observe(root);
    },

    watch(list) {
      if (this.lists.has(list)) return;
      this.lists.add(list);
      // jQuery shows / moves the list through its style, and rebuilds the rows
      // on every keystroke.
      new MutationObserver(() => this.update(list)).observe(list, {
        childList: true,
        attributes: true,
        attributeFilter: ['style'],
      });
      this.update(list);
    },

    /** The message box or edit box this list is for, or null if it's not ours. */
    ownerOf() {
      const active = document.activeElement;
      return active?.matches?.('#shbox_text, #editShout') && this.root.contains(active) ? active : null;
    },

    update(list) {
      const open = list.style.display !== 'none' && list.children.length > 0;
      const input = open ? this.ownerOf() : null;
      if (!input) {
        if (this.shown === list) this.shown = null;
        if (!open) return;
        list.classList.remove('mamsb-ac'); // some other box on the page: leave it as MaM made it
        return;
      }
      list.classList.add('mamsb-ac');
      list.classList.toggle('is-mobile', mobileViewActive);
      list.dataset.mamsbFor = input.id;
      this.tidyRows(list);
      this.shown = list;
      this.place(list);
    },

    /** Smilie rows: picture then code. Name rows: in the member's colour, if known. */
    tidyRows(list) {
      let colours = null;
      for (const row of list.querySelectorAll('.ui-menu-item-wrapper:not([data-mamsb-row])')) {
        row.dataset.mamsbRow = '';
        const picture = row.querySelector('img');
        if (picture) {
          const code = document.createElement('span');
          code.className = 'mamsb-ac-code';
          code.textContent = row.textContent.trim();
          const holder = document.createElement('span');
          holder.className = 'mamsb-ac-pic';
          holder.append(picture);
          row.replaceChildren(holder, code);
        } else {
          colours ??= this.nameColours();
          const colour = colours.get(row.textContent.trim().toLowerCase());
          if (colour) row.style.setProperty('color', colour, 'important');
        }
      }
    },

    /**
     * Name → readable colour, for everyone with a shout in the list. MaM's
     * suggestions are plain text, so names that haven't shouted stay uncoloured.
     */
    nameColours() {
      const colours = new Map();
      for (const span of this.root.querySelectorAll('#sbf .mamsb-msg > .mamsb-nick span[data-mamsb-color]')) {
        const name = span.textContent.trim().toLowerCase();
        if (!name || colours.has(name)) continue;
        // A name shown on a coloured background uses that colour for its text here.
        const rgb = parseRgb(span.dataset.mamsbColor) || parseRgb(span.dataset.mamsbBg);
        if (!rgb) continue;
        const readable = readableColour(rgb, this.LIST_BG_RGB) || rgb;
        colours.set(name, `rgb(${readable.join(', ')})`);
      }
      return colours;
    },

    /** Just above the box (or below, if there's more room there), inside the shoutbox. */
    place(list) {
      const input = document.getElementById(list.dataset.mamsbFor);
      if (!input || !list.isConnected) return;
      const box = input.getBoundingClientRect();
      const shoutbox = this.root.getBoundingClientRect();
      const roomAbove = box.top - shoutbox.top - 2 * this.GAP;
      const roomBelow = shoutbox.bottom - box.bottom - 2 * this.GAP;
      const below = roomAbove < this.MIN_HEIGHT && roomBelow > roomAbove;
      const room = below ? roomBelow : roomAbove;
      const maxHeight = Math.max(80, mobileViewActive ? room : Math.min(this.MAX_HEIGHT, room));
      const values = {
        '--sb-ac-top': `${Math.round(below ? box.bottom + this.GAP : box.top - this.GAP)}px`,
        '--sb-ac-left': `${Math.round(box.left)}px`,
        '--sb-ac-width': `${Math.round(box.width)}px`,
        '--sb-ac-max-h': `${Math.round(maxHeight)}px`,
      };
      // Only write what changed: these writes are seen by the list's watcher.
      for (const [name, value] of Object.entries(values)) {
        if (list.style.getPropertyValue(name) !== value) list.style.setProperty(name, value);
      }
      list.classList.toggle('is-below', below);
    },
  };

  // ---- BEGIN EMOJI DATA (generated by tools/build-emoji-data.mjs, do not edit by hand) ----
  //
  // Emoji, names and search words from emojibase-data 18.0.0
  // (https://emojibase.dev), which uses names and keywords from the Unicode
  // CLDR project (https://cldr.unicode.org). Their notices follow.
  //
  //   MIT License
  //
  //   Copyright (c) 2017-2019 Miles Johnson
  //
  //   Permission is hereby granted, free of charge, to any person obtaining a copy
  //   of this software and associated documentation files (the "Software"), to deal
  //   in the Software without restriction, including without limitation the rights
  //   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  //   copies of the Software, and to permit persons to whom the Software is
  //   furnished to do so, subject to the following conditions:
  //
  //   The above copyright notice and this permission notice shall be included in all
  //   copies or substantial portions of the Software.
  //
  //   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  //   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  //   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  //   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  //   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  //   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  //   SOFTWARE.
  //
  //   UNICODE LICENSE V3
  //
  //   COPYRIGHT AND PERMISSION NOTICE
  //
  //   Copyright © 1991-2024 Unicode, Inc.
  //
  //   NOTICE TO USER: Carefully read the following legal agreement. BY
  //   DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
  //   SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
  //   TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
  //   DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.
  //
  //   Permission is hereby granted, free of charge, to any person obtaining a
  //   copy of data files and any associated documentation (the "Data Files") or
  //   software and any associated documentation (the "Software") to deal in the
  //   Data Files or Software without restriction, including without limitation
  //   the rights to use, copy, modify, merge, publish, distribute, and/or sell
  //   copies of the Data Files or Software, and to permit persons to whom the
  //   Data Files or Software are furnished to do so, provided that either (a)
  //   this copyright and permission notice appear with all copies of the Data
  //   Files or Software, or (b) this copyright and permission notice appear in
  //   associated Documentation.
  //
  //   THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
  //   KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  //   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
  //   THIRD PARTY RIGHTS.
  //
  //   IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
  //   BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
  //   OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
  //   WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
  //   ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
  //   FILES OR SOFTWARE.
  //
  //   Except as contained in this notice, the name of a copyright holder shall
  //   not be used in advertising or otherwise to promote the sale, use or other
  //   dealings in these Data Files or Software without prior written
  //   authorization of the copyright holder.
  //
  // Each emoji line: [emoji, Unicode emoji version, name, more search words,
  // (optional) the five skin-tone variants, light to dark, space-separated].
  // A plain string starts a new section.

  /** [Unicode emoji version, an emoji first added in it], newest first. */
  const EMOJI_VERSION_TESTS = [[18,"🫫"],[17,"🫪"],[16,"🫩"],[15,"🫨"],[14,"🫠"],[13,"🥲"],[12,"🥱"],[11,"🥰"],[5,"🤩"],[3,"🤣"]];

  function emojiData() {
    return [
      "smileys & emotion",
      ["😀",1,"grinning face","cheerful cheery grin happy laugh nice smile smiling teeth"],
      ["😃",0.6,"grinning face with big eyes","awesome grin happy mouth open smile smiling teeth yay smiley"],
      ["😄",0.6,"grinning face with smiling eyes","eye grin happy laugh lol mouth open smile"],
      ["😁",0.6,"beaming face with smiling eyes","eye grin grinning happy nice smile teeth"],
      ["😆",0.6,"grinning squinting face","closed eyes haha hahaha happy laugh lol mouth open rofl smile smiling laughing satisfied"],
      ["😅",0.6,"grinning face with sweat","cold dejected excited mouth nervous open smile smiling stress stressed"],
      ["🤣",3,"rolling on the floor laughing","crying face funny haha happy hehe hilarious joy laugh lmao lol rofl roflmao tear"],
      ["😂",0.6,"face with tears of joy","crying feels funny haha happy hehe hilarious laugh lmao lol rofl roflmao tear"],
      ["🙂",1,"slightly smiling face","happy smile"],
      ["🙃",1,"upside-down face","hehe smile upside down"],
      ["🫠",14,"melting face","disappear dissolve embarrassed haha heat hot liquid lol melt sarcasm sarcastic"],
      ["🫫",18,"cracking face","breaking crumbling masking resilience reveal tension transformation"],
      ["😉",0.6,"winking face","flirt heartbreaker sexy slide tease wink winks"],
      ["😊",0.6,"smiling face with smiling eyes","blush eye glad satisfied smile"],
      ["😇",1,"smiling face with halo","angel angelic angels blessed fairy fairytale fantasy happy innocent peaceful smile spirit tale"],
      ["🥰",11,"smiling face with hearts","3 adore crush heart ily love romance smile you three"],
      ["😍",0.6,"smiling face with heart-eyes","143 bae eye feels hearts ily kisses love romance romantic smile xoxo heart eyes"],
      ["🤩",5,"star-struck","excited eyes face grinning smile star starry-eyed wow struck"],
      ["😘",0.6,"face blowing a kiss","adorbs bae flirt heart ily love lover miss muah romantic smooch xoxo you kissing"],
      ["😗",1,"kissing face","143 date dating flirt ily kiss love smooch smooches xoxo you"],
      ["☺️",0.6,"smiling face","happy outlined relaxed smile"],
      ["😚",0.6,"kissing face with closed eyes","143 bae blush date dating eye flirt ily kisses smooches xoxo"],
      ["😙",1,"kissing face with smiling eyes","143 closed date dating eye flirt ily kiss kisses love night smile"],
      ["🥲",13,"smiling face with tear","glad grateful happy joy pain proud relieved smile smiley touched"],
      ["😋",0.6,"face savoring food","delicious eat full hungry savor smile smiling tasty um yum yummy"],
      ["😛",1,"face with tongue","awesome cool nice party stuck-out sweet stuck out"],
      ["😜",0.6,"winking face with tongue","crazy epic eye funny joke loopy nutty party stuck-out wacky weirdo wink yolo stuck out"],
      ["🤪",5,"zany face","crazy eye eyes goofy large small"],
      ["😝",0.6,"squinting face with tongue","closed eye eyes gross horrible omg stuck-out taste whatever yolo stuck out"],
      ["🤑",1,"money-mouth face","money mouth paid"],
      ["🤗",1,"smiling face with open hands","hug hugging hugs"],
      ["🤭",5,"face with hand over mouth","giggle giggling oops realization secret shock sudden surprise whoops"],
      ["🫢",14,"face with open eyes and hand over mouth","amazement awe disbelief embarrass gasp omg quiet scared shock surprise"],
      ["🫣",14,"face with peeking eye","captivated embarrass hide hiding peek peep scared shy stare"],
      ["🤫",5,"shushing face","quiet shh shush"],
      ["🤔",1,"thinking face","chin consider hmm ponder pondering wondering"],
      ["🫡",14,"saluting face","ok good luck ma’am respect salute sir troops yes"],
      ["🤐",1,"zipper-mouth face","keep mouth quiet secret shut zip zipper"],
      ["🤨",5,"face with raised eyebrow","disapproval disbelief distrust emoji hmm mild skeptic skeptical skepticism surprise what"],
      ["😐",0.7,"neutral face","awkward blank deadpan expressionless fine jealous meh oh shade straight unamused unhappy unimpressed whatever"],
      ["😑",1,"expressionless face","awkward dead fine inexpressive jealous meh not oh omg straight uh unhappy unimpressed whatever"],
      ["😶",1,"face without mouth","awkward blank expressionless mouthless mute quiet secret silence silent speechless no"],
      ["🫥",14,"dotted line face","depressed disappear hidden hide introvert invisible meh whatever wtv"],
      ["😶‍🌫️",13.1,"face in clouds","absentminded fog head"],
      ["😏",0.6,"smirking face","boss dapper flirt homie kidding leer shade slick sly smirk smug snicker suave suspicious swag"],
      ["😒",0.6,"unamused face","... bored fine jealous jel jelly pissed smh ugh uhh unhappy weird whatever"],
      ["🙄",1,"face with rolling eyes","eyeroll shade ugh whatever roll"],
      ["😬",1,"grimacing face","awk awkward dentist grimace grinning smile smiling"],
      ["😮‍💨",13.1,"face exhaling","blow blowing exhale exhausted gasp groan relief sigh smiley smoke whisper whistle"],
      ["🤥",3,"lying face","liar lie pinocchio"],
      ["🫨",15,"shaking face","crazy daze earthquake omg panic shock surprise vibrate whoa wow"],
      ["🙂‍↔️",15.1,"head shaking horizontally","no shake"],
      ["🙂‍↕️",15.1,"head shaking vertically","nod yes"],
      ["😌",0.6,"relieved face","calm peace relief zen"],
      ["😔",0.6,"pensive face","awful bored dejected died disappointed losing lost sad sucks"],
      ["😪",0.6,"sleepy face","crying good night sad sleep sleeping tired"],
      ["🤤",3,"drooling face",""],
      ["😴",1,"sleeping face","bed bedtime good goodnight nap night sleep tired whatever yawn zzz"],
      ["🫩",16,"face with bags under eyes","bored exhausted fatigued late sleepy tired weary"],
      ["😷",0.6,"face with medical mask","cold dentist dermatologist doctor dr germs medicine sick"],
      ["🤒",1,"face with thermometer","ill sick"],
      ["🤕",1,"face with head-bandage","bandage hurt injury ouch head"],
      ["🤢",3,"nauseated face","gross nasty sick vomit"],
      ["🤮",5,"face vomiting","barf ew gross puke sick spew throw up vomit"],
      ["🤧",3,"sneezing face","fever flu gesundheit sick sneeze"],
      ["🥵",11,"hot face","dying feverish heat panting red-faced stroke sweating tongue"],
      ["🥶",11,"cold face","blue blue-faced freezing frostbite icicles subzero teeth"],
      ["🥴",11,"woozy face","dizzy drunk eyes intoxicated mouth tipsy uneven wavy"],
      ["😵",0.6,"face with crossed-out eyes","dead dizzy feels knocked out sick tired"],
      ["😵‍💫",13.1,"face with spiral eyes","confused dizzy hypnotized omg smiley trouble whoa woah woozy"],
      ["🤯",5,"exploding head","blown explode mind mindblown no shocked way"],
      ["🤠",3,"cowboy hat face","cowgirl"],
      ["🥳",11,"partying face","bday birthday celebrate celebration excited happy hat hooray horn party"],
      ["🥸",13,"disguised face","disguise eyebrow glasses incognito moustache mustache nose person spy tache tash"],
      ["😎",1,"smiling face with sunglasses","awesome beach bright bro chilling cool rad relaxed shades slay smile style swag win"],
      ["🤓",1,"nerd face","brainy clever expert geek gifted glasses intelligent smart"],
      ["🧐",5,"face with monocle","classy fancy rich stuffy wealthy"],
      ["😕",1,"confused face","befuddled confusing dunno frown hm meh not sad sorry sure"],
      ["🫤",14,"face with diagonal mouth","confused confusion disappointed doubt doubtful frustrated frustration meh skeptical unsure whatever wtv"],
      ["😟",1,"worried face","anxious butterflies nerves nervous sad stress stressed surprised worry"],
      ["🙁",1,"slightly frowning face","frown sad"],
      ["☹️",0.7,"frowning face","frown sad"],
      ["😮",1,"face with open mouth","believe forgot omg shocked surprised sympathy unbelievable unreal whoa wow you"],
      ["😯",1,"hushed face","epic omg stunned surprised whoa woah"],
      ["😲",0.6,"astonished face","cost no omg shocked totally way"],
      ["😳",0.6,"flushed face","amazed awkward crazy dazed dead disbelief embarrassed geez heat hot impressed jeez what wow"],
      ["🫪",17,"distorted face","anxiety bloated panic shocked surprised vulnerable"],
      ["🥺",11,"pleading face","begging big eyes mercy not please pretty puppy sad why"],
      ["🥹",14,"face holding back tears","admiration aww cry embarrassed feelings grateful gratitude joy please proud resist sad"],
      ["😦",1,"frowning face with open mouth","caught frown guard scared scary surprise what wow"],
      ["😧",1,"anguished face","forgot scared scary stressed surprise unhappy what wow"],
      ["😨",0.6,"fearful face","afraid anxious blame fear scared worried"],
      ["😰",0.6,"anxious face with sweat","blue cold eek mouth nervous open rushed scared yikes"],
      ["😥",0.6,"sad but relieved face","anxious call close complicated disappointed not sweat time whew"],
      ["😢",0.6,"crying face","awful cry feels miss sad tear triste unhappy"],
      ["😭",0.6,"loudly crying face","bawling cry sad sob tear tears unhappy"],
      ["😱",0.6,"face screaming in fear","epic fearful munch scared scream screamer shocked surprised woah"],
      ["😖",0.6,"confounded face","annoyed confused cringe distraught feels frustrated mad sad"],
      ["😣",0.6,"persevering face","concentrate concentration focus headache persevere"],
      ["😞",0.6,"disappointed face","awful blame dejected fail losing sad unhappy"],
      ["😓",0.6,"downcast face with sweat","close cold feels headache nervous sad scared yikes"],
      ["😩",0.6,"weary face","crying fail feels hungry mad nooo sad sleepy tired unhappy"],
      ["😫",0.6,"tired face","cost feels nap sad sneeze"],
      ["🥱",12,"yawning face","bedtime bored goodnight nap night sleep sleepy tired whatever yawn zzz"],
      ["😤",0.6,"face with steam from nose","anger angry feels fume fuming furious fury mad triumph unhappy won"],
      ["😡",0.6,"enraged face","anger angry feels mad maddening pouting rage red shade unhappy upset pout"],
      ["😠",0.6,"angry face","anger blame feels frustrated mad maddening rage shade unhappy upset"],
      ["🤬",5,"face with symbols on mouth","censor cursing cussing mad pissed swearing"],
      ["😈",1,"smiling face with horns","demon devil evil fairy fairytale fantasy purple shade smile tale imp"],
      ["👿",0.6,"angry face with horns","demon devil evil fairy fairytale fantasy imp mischievous purple shade tale"],
      ["💀",0.6,"skull","body dead death face fairy fairytale i’m lmao monster tale yolo"],
      ["☠️",1,"skull and crossbones","bone dead death face monster"],
      ["💩",0.6,"pile of poo","bs comic doo dung face fml monster poop smelly smh stink stinks stinky turd hankey shit"],
      ["🤡",3,"clown face",""],
      ["👹",0.6,"ogre","creature devil face fairy fairytale fantasy mask monster scary tale japanese"],
      ["👺",0.6,"goblin","angry creature face fairy fairytale fantasy mask mean monster tale japanese"],
      ["👻",0.6,"ghost","boo creature excited face fairy fairytale fantasy halloween haunting monster scary silly tale"],
      ["👽",0.6,"alien","creature extraterrestrial face fairy fairytale fantasy monster space tale ufo"],
      ["👾",0.6,"alien monster","creature extraterrestrial face fairy fairytale fantasy game gamer games pixelated space tale ufo invader"],
      ["🤖",1,"robot","face monster"],
      ["😺",0.6,"grinning cat","animal face mouth open smile smiling smiley"],
      ["😸",0.6,"grinning cat with smiling eyes","animal eye face grin smile"],
      ["😹",0.6,"cat with tears of joy","animal face laugh laughing lol tear"],
      ["😻",0.6,"smiling cat with heart-eyes","animal eye face heart love smile eyes"],
      ["😼",0.6,"cat with wry smile","animal face ironic smirk"],
      ["😽",0.6,"kissing cat","animal closed eye eyes face kiss"],
      ["🙀",0.6,"weary cat","animal face oh surprised scream"],
      ["😿",0.6,"crying cat","animal cry face sad tear"],
      ["😾",0.6,"pouting cat","animal face"],
      ["🙈",0.6,"see-no-evil monkey","embarrassed evil face forbidden forgot gesture hide no omg prohibited scared secret smh watch see"],
      ["🙉",0.6,"hear-no-evil monkey","animal ears evil face forbidden gesture hear listen no not prohibited secret shh tmi"],
      ["🙊",0.6,"speak-no-evil monkey","animal evil face forbidden gesture no not oops prohibited quiet secret speak stealth"],
      ["💌",0.6,"love letter","heart mail romance valentine"],
      ["💘",0.6,"heart with arrow","143 adorbs cupid date emotion ily love romance valentine"],
      ["💝",0.6,"heart with ribbon","143 anniversary emotion ily kisses valentine xoxo gift"],
      ["💖",0.6,"sparkling heart","143 emotion excited good ily kisses morning night sparkle xoxo"],
      ["💗",0.6,"growing heart","143 emotion excited heartpulse ily kisses muah nervous pulse xoxo"],
      ["💓",0.6,"beating heart","143 cardio emotion heartbeat ily love pulsating pulse"],
      ["💞",0.6,"revolving hearts","143 adorbs anniversary emotion heart"],
      ["💕",0.6,"two hearts","143 anniversary date dating emotion heart ily kisses love loving xoxo"],
      ["💟",0.6,"heart decoration","143 emotion hearth purple white"],
      ["❣️",1,"heart exclamation","bang heavy mark punctuation"],
      ["💔",0.6,"broken heart","break crushed emotion heartbroken lonely sad"],
      ["❤️‍🔥",13.1,"heart on fire","burn love lust sacred"],
      ["❤️‍🩹",13.1,"mending heart","healthier improving recovering recuperating well"],
      ["❤️",0.6,"red heart","emotion love"],
      ["🩷",15,"pink heart","143 adorable cute emotion ily like love special sweet"],
      ["🧡",5,"orange heart","143"],
      ["💛",0.6,"yellow heart","143 cardiac emotion ily love"],
      ["💚",0.6,"green heart","143 emotion ily love romantic"],
      ["💙",0.6,"blue heart","143 emotion ily love romance"],
      ["🩵",15,"light blue heart","143 cute cyan emotion ily like love sky special teal"],
      ["💜",0.6,"purple heart","143 bestest emotion ily love"],
      ["🤎",12,"brown heart","143"],
      ["🖤",3,"black heart","evil wicked"],
      ["🩶",15,"grey heart","143 emotion gray ily love silver slate special"],
      ["🤍",12,"white heart","143"],
      ["💋",0.6,"kiss mark","dating emotion heart kissing lips romance sexy"],
      ["💯",0.6,"hundred points","100 true a+ agree clearly definitely faithful fleek full keep perfect point score truth yup"],
      ["💢",0.6,"anger symbol","angry comic mad upset"],
      ["🫯",17,"fight cloud","argument brawl debate disagreement ruckus wrestle"],
      ["💥",0.6,"collision","bomb boom collide comic explode"],
      ["💫",0.6,"dizzy","comic shining shooting star stars"],
      ["💦",0.6,"sweat droplets","comic drip droplet drops splashing squirt water wet work workout"],
      ["💨",0.6,"dashing away","cloud comic dash fart fast go gone gotta running smoke"],
      ["🕳️",0.7,"hole",""],
      ["💬",0.6,"speech balloon","bubble comic dialog message sms talk text typing"],
      ["👁️‍🗨️",2,"eye in speech bubble","balloon witness"],
      ["🗨️",2,"left speech bubble","balloon dialog"],
      ["🗯️",0.7,"right anger bubble","angry balloon mad"],
      ["💭",1,"thought balloon","bubble cartoon cloud comic daydream decisions dream idea invent invention realize think thoughts wonder"],
      ["💤",0.6,"ZZZ","comic good goodnight night sleep sleeping sleepy tired"],
      "people & body",
      ["👋",0.6,"waving hand","bye cya g2g greetings gtg hello hey hi later outtie ttfn ttyl wave yo you","👋🏻 👋🏼 👋🏽 👋🏾 👋🏿"],
      ["🤚",3,"raised back of hand","backhand","🤚🏻 🤚🏼 🤚🏽 🤚🏾 🤚🏿"],
      ["🖐️",0.7,"hand with fingers splayed","finger raised stop","🖐🏻 🖐🏼 🖐🏽 🖐🏾 🖐🏿"],
      ["✋",0.6,"raised hand","5 five high stop","✋🏻 ✋🏼 ✋🏽 ✋🏾 ✋🏿"],
      ["🖖",1,"vulcan salute","finger hand hands","🖖🏻 🖖🏼 🖖🏽 🖖🏾 🖖🏿"],
      ["🫱",14,"rightwards hand","handshake hold reach right rightward shake","🫱🏻 🫱🏼 🫱🏽 🫱🏾 🫱🏿"],
      ["🫲",14,"leftwards hand","handshake hold left leftward reach shake","🫲🏻 🫲🏼 🫲🏽 🫲🏾 🫲🏿"],
      ["🫳",14,"palm down hand","dismiss drop dropped pick shoo up","🫳🏻 🫳🏼 🫳🏽 🫳🏾 🫳🏿"],
      ["🫴",14,"palm up hand","beckon catch come hold know lift me offer tell","🫴🏻 🫴🏼 🫴🏽 🫴🏾 🫴🏿"],
      ["🫷",15,"leftwards pushing hand","block five halt high hold leftward pause push refuse slap stop wait","🫷🏻 🫷🏼 🫷🏽 🫷🏾 🫷🏿"],
      ["🫸",15,"rightwards pushing hand","block five halt high hold pause push refuse rightward slap stop wait","🫸🏻 🫸🏼 🫸🏽 🫸🏾 🫸🏿"],
      ["👌",0.6,"OK hand","awesome bet dope fleek fosho got gotcha legit okay pinch rad sure sweet three","👌🏻 👌🏼 👌🏽 👌🏾 👌🏿"],
      ["🤌",13,"pinched fingers","gesture hand hold huh interrogation patience relax sarcastic ugh what zip","🤌🏻 🤌🏼 🤌🏽 🤌🏾 🤌🏿"],
      ["🤏",12,"pinching hand","amount bit fingers little small sort","🤏🏻 🤏🏼 🤏🏽 🤏🏾 🤏🏿"],
      ["✌️",0.6,"victory hand","peace v","✌🏻 ✌🏼 ✌🏽 ✌🏾 ✌🏿"],
      ["🤞",3,"crossed fingers","cross finger hand luck","🤞🏻 🤞🏼 🤞🏽 🤞🏾 🤞🏿"],
      ["🫰",14,"hand with index finger and thumb crossed","<3 expensive heart love money snap","🫰🏻 🫰🏼 🫰🏽 🫰🏾 🫰🏿"],
      ["🤟",5,"love-you gesture","ily fingers hand love three you","🤟🏻 🤟🏼 🤟🏽 🤟🏾 🤟🏿"],
      ["🤘",1,"sign of the horns","finger hand rock-on metal","🤘🏻 🤘🏼 🤘🏽 🤘🏾 🤘🏿"],
      ["🤙",3,"call me hand","shaka hang loose","🤙🏻 🤙🏼 🤙🏽 🤙🏾 🤙🏿"],
      ["👈",0.6,"backhand index pointing left","finger hand point","👈🏻 👈🏼 👈🏽 👈🏾 👈🏿"],
      ["👉",0.6,"backhand index pointing right","finger hand point","👉🏻 👉🏼 👉🏽 👉🏾 👉🏿"],
      ["👆",0.6,"backhand index pointing up","finger hand point 2","👆🏻 👆🏼 👆🏽 👆🏾 👆🏿"],
      ["🖕",1,"middle finger","hand fu","🖕🏻 🖕🏼 🖕🏽 🖕🏾 🖕🏿"],
      ["👇",0.6,"backhand index pointing down","finger hand point","👇🏻 👇🏼 👇🏽 👇🏾 👇🏿"],
      ["☝️",0.6,"index pointing up","finger hand point this","☝🏻 ☝🏼 ☝🏽 ☝🏾 ☝🏿"],
      ["🫵",14,"index pointing at the viewer","finger hand poke you","🫵🏻 🫵🏼 🫵🏽 🫵🏾 🫵🏿"],
      ["👍",0.6,"thumbs up","+1 good hand like thumb yes thumbsup","👍🏻 👍🏼 👍🏽 👍🏾 👍🏿"],
      ["👎",0.6,"thumbs down","-1 bad dislike good hand no nope thumb thumbsdown","👎🏻 👎🏼 👎🏽 👎🏾 👎🏿"],
      ["🫹",18,"leftwards thumb sign","grip left neutral point that this","🫹🏻 🫹🏼 🫹🏽 🫹🏾 🫹🏿"],
      ["🫺",18,"rightwards thumb sign","grip neutral point right that this","🫺🏻 🫺🏼 🫺🏽 🫺🏾 🫺🏿"],
      ["✊",0.6,"raised fist","clenched hand punch solidarity","✊🏻 ✊🏼 ✊🏽 ✊🏾 ✊🏿"],
      ["👊",0.6,"oncoming fist","absolutely agree boom bro bruh bump clenched correct hand knuckle pound punch rock ttyl facepunch","👊🏻 👊🏼 👊🏽 👊🏾 👊🏿"],
      ["🤛",3,"left-facing fist","leftwards left","🤛🏻 🤛🏼 🤛🏽 🤛🏾 🤛🏿"],
      ["🤜",3,"right-facing fist","rightwards right","🤜🏻 🤜🏼 🤜🏽 🤜🏾 🤜🏿"],
      ["👏",0.6,"clapping hands","applause approval awesome clap congrats congratulations excited good great hand homie job nice prayed well yay","👏🏻 👏🏼 👏🏽 👏🏾 👏🏿"],
      ["🙌",0.6,"raising hands","celebration gesture hand hooray praise raised","🙌🏻 🙌🏼 🙌🏽 🙌🏾 🙌🏿"],
      ["🫶",14,"heart hands","<3 love you","🫶🏻 🫶🏼 🫶🏽 🫶🏾 🫶🏿"],
      ["👐",0.6,"open hands","hand hug jazz swerve","👐🏻 👐🏼 👐🏽 👐🏾 👐🏿"],
      ["🤲",5,"palms up together","cupped dua hands pray prayer wish","🤲🏻 🤲🏼 🤲🏽 🤲🏾 🤲🏿"],
      ["🤝",3,"handshake","agreement deal hand meeting shake","🤝🏻 🤝🏼 🤝🏽 🤝🏾 🤝🏿"],
      ["🙏",0.6,"folded hands","appreciate ask beg blessed bow cmon five gesture hand high please pray thanks thx","🙏🏻 🙏🏼 🙏🏽 🙏🏾 🙏🏿"],
      ["✍️",0.7,"writing hand","write","✍🏻 ✍🏼 ✍🏽 ✍🏾 ✍🏿"],
      ["💅",0.6,"nail polish","bored care cosmetics done makeup manicure whatever","💅🏻 💅🏼 💅🏽 💅🏾 💅🏿"],
      ["🤳",3,"selfie","camera phone","🤳🏻 🤳🏼 🤳🏽 🤳🏾 🤳🏿"],
      ["💪",0.6,"flexed biceps","arm beast bench bodybuilder bro curls flex gains gym jacked muscle press ripped strong weightlift","💪🏻 💪🏼 💪🏽 💪🏾 💪🏿"],
      ["🦾",12,"mechanical arm","accessibility prosthetic"],
      ["🦿",12,"mechanical leg","accessibility prosthetic"],
      ["🦵",11,"leg","bent foot kick knee limb","🦵🏻 🦵🏼 🦵🏽 🦵🏾 🦵🏿"],
      ["🦶",11,"foot","ankle feet kick stomp","🦶🏻 🦶🏼 🦶🏽 🦶🏾 🦶🏿"],
      ["👂",0.6,"ear","body ears hear hearing listen listening sound","👂🏻 👂🏼 👂🏽 👂🏾 👂🏿"],
      ["🦻",12,"ear with hearing aid","accessibility hard","🦻🏻 🦻🏼 🦻🏽 🦻🏾 🦻🏿"],
      ["👃",0.6,"nose","body noses nosey odor smell smells","👃🏻 👃🏼 👃🏽 👃🏾 👃🏿"],
      ["🧠",5,"brain","intelligent smart"],
      ["🫀",13,"anatomical heart","beat cardiology heartbeat organ pulse real red"],
      ["🫁",13,"lungs","breath breathe exhalation inhalation lung organ respiration"],
      ["🦷",11,"tooth","dentist pearly teeth white"],
      ["🦴",11,"bone","bones dog skeleton wishbone"],
      ["👀",0.6,"eyes","body eye face googly look looking omg peep see seeing"],
      ["👁️",0.7,"eye","1 body one"],
      ["👅",0.6,"tongue","body lick slurp"],
      ["👄",0.6,"mouth","beauty body kiss kissing lips lipstick"],
      ["🫦",14,"biting lip","anxious bite fear flirt flirting kiss lipstick nervous sexy uncomfortable worried worry"],
      ["👶",0.6,"baby","babies children goo infant newborn pregnant young","👶🏻 👶🏼 👶🏽 👶🏾 👶🏿"],
      ["🧒",5,"child","bright-eyed grandchild kid young younger","🧒🏻 🧒🏼 🧒🏽 🧒🏾 🧒🏿"],
      ["👦",0.6,"boy","bright-eyed child grandson kid son young younger","👦🏻 👦🏼 👦🏽 👦🏾 👦🏿"],
      ["👧",0.6,"girl","virgo bright-eyed child daughter granddaughter kid young younger zodiac","👧🏻 👧🏼 👧🏽 👧🏾 👧🏿"],
      ["🧑",5,"person","adult","🧑🏻 🧑🏼 🧑🏽 🧑🏾 🧑🏿"],
      ["👱",0.6,"person: blond hair","blond-haired human haired","👱🏻 👱🏼 👱🏽 👱🏾 👱🏿"],
      ["👨",0.6,"man","adult bro","👨🏻 👨🏼 👨🏽 👨🏾 👨🏿"],
      ["🧔",5,"person: beard","bearded whiskers","🧔🏻 🧔🏼 🧔🏽 🧔🏾 🧔🏿"],
      ["🧔‍♂️",13.1,"man: beard","bearded whiskers","🧔🏻‍♂️ 🧔🏼‍♂️ 🧔🏽‍♂️ 🧔🏾‍♂️ 🧔🏿‍♂️"],
      ["🧔‍♀️",13.1,"woman: beard","bearded whiskers","🧔🏻‍♀️ 🧔🏼‍♀️ 🧔🏽‍♀️ 🧔🏾‍♀️ 🧔🏿‍♀️"],
      ["👨‍🦰",11,"man: red hair","adult bro haired","👨🏻‍🦰 👨🏼‍🦰 👨🏽‍🦰 👨🏾‍🦰 👨🏿‍🦰"],
      ["👨‍🦱",11,"man: curly hair","adult bro haired","👨🏻‍🦱 👨🏼‍🦱 👨🏽‍🦱 👨🏾‍🦱 👨🏿‍🦱"],
      ["👨‍🦳",11,"man: white hair","adult bro haired","👨🏻‍🦳 👨🏼‍🦳 👨🏽‍🦳 👨🏾‍🦳 👨🏿‍🦳"],
      ["👨‍🦲",11,"man: bald","adult bro","👨🏻‍🦲 👨🏼‍🦲 👨🏽‍🦲 👨🏾‍🦲 👨🏿‍🦲"],
      ["👩",0.6,"woman","adult lady","👩🏻 👩🏼 👩🏽 👩🏾 👩🏿"],
      ["👩‍🦰",11,"woman: red hair","adult lady haired","👩🏻‍🦰 👩🏼‍🦰 👩🏽‍🦰 👩🏾‍🦰 👩🏿‍🦰"],
      ["🧑‍🦰",12.1,"person: red hair","adult","🧑🏻‍🦰 🧑🏼‍🦰 🧑🏽‍🦰 🧑🏾‍🦰 🧑🏿‍🦰"],
      ["👩‍🦱",11,"woman: curly hair","adult lady haired","👩🏻‍🦱 👩🏼‍🦱 👩🏽‍🦱 👩🏾‍🦱 👩🏿‍🦱"],
      ["🧑‍🦱",12.1,"person: curly hair","adult","🧑🏻‍🦱 🧑🏼‍🦱 🧑🏽‍🦱 🧑🏾‍🦱 🧑🏿‍🦱"],
      ["👩‍🦳",11,"woman: white hair","adult lady haired","👩🏻‍🦳 👩🏼‍🦳 👩🏽‍🦳 👩🏾‍🦳 👩🏿‍🦳"],
      ["🧑‍🦳",12.1,"person: white hair","adult","🧑🏻‍🦳 🧑🏼‍🦳 🧑🏽‍🦳 🧑🏾‍🦳 🧑🏿‍🦳"],
      ["👩‍🦲",11,"woman: bald","adult lady","👩🏻‍🦲 👩🏼‍🦲 👩🏽‍🦲 👩🏾‍🦲 👩🏿‍🦲"],
      ["🧑‍🦲",12.1,"person: bald","adult","🧑🏻‍🦲 🧑🏼‍🦲 🧑🏽‍🦲 🧑🏾‍🦲 🧑🏿‍🦲"],
      ["👱‍♀️",4,"woman: blond hair","blond-haired blonde haired","👱🏻‍♀️ 👱🏼‍♀️ 👱🏽‍♀️ 👱🏾‍♀️ 👱🏿‍♀️"],
      ["👱‍♂️",4,"man: blond hair","blond-haired haired","👱🏻‍♂️ 👱🏼‍♂️ 👱🏽‍♂️ 👱🏾‍♂️ 👱🏿‍♂️"],
      ["🧓",5,"older person","adult elderly grandparent old wise","🧓🏻 🧓🏼 🧓🏽 🧓🏾 🧓🏿"],
      ["👴",0.6,"old man","adult bald elderly gramps grandfather grandpa wise older","👴🏻 👴🏼 👴🏽 👴🏾 👴🏿"],
      ["👵",0.6,"old woman","adult elderly grandma grandmother granny lady wise older","👵🏻 👵🏼 👵🏽 👵🏾 👵🏿"],
      ["🙍",0.6,"person frowning","annoyed disappointed disgruntled disturbed frown frustrated gesture irritated upset","🙍🏻 🙍🏼 🙍🏽 🙍🏾 🙍🏿"],
      ["🙍‍♂️",4,"man frowning","annoyed disappointed disgruntled disturbed frown frustrated gesture irritated upset","🙍🏻‍♂️ 🙍🏼‍♂️ 🙍🏽‍♂️ 🙍🏾‍♂️ 🙍🏿‍♂️"],
      ["🙍‍♀️",4,"woman frowning","annoyed disappointed disgruntled disturbed frown frustrated gesture irritated upset","🙍🏻‍♀️ 🙍🏼‍♀️ 🙍🏽‍♀️ 🙍🏾‍♀️ 🙍🏿‍♀️"],
      ["🙎",0.6,"person pouting","disappointed downtrodden frown grimace scowl sulk upset whine face","🙎🏻 🙎🏼 🙎🏽 🙎🏾 🙎🏿"],
      ["🙎‍♂️",4,"man pouting","disappointed downtrodden frown grimace scowl sulk upset whine","🙎🏻‍♂️ 🙎🏼‍♂️ 🙎🏽‍♂️ 🙎🏾‍♂️ 🙎🏿‍♂️"],
      ["🙎‍♀️",4,"woman pouting","disappointed downtrodden frown grimace scowl sulk upset whine","🙎🏻‍♀️ 🙎🏼‍♀️ 🙎🏽‍♀️ 🙎🏾‍♀️ 🙎🏿‍♀️"],
      ["🙅",0.6,"person gesturing NO","forbidden gesture hand not prohibit good","🙅🏻 🙅🏼 🙅🏽 🙅🏾 🙅🏿"],
      ["🙅‍♂️",4,"man gesturing NO","forbidden gesture hand not prohibit ng good","🙅🏻‍♂️ 🙅🏼‍♂️ 🙅🏽‍♂️ 🙅🏾‍♂️ 🙅🏿‍♂️"],
      ["🙅‍♀️",4,"woman gesturing NO","forbidden gesture hand not prohibit ng good","🙅🏻‍♀️ 🙅🏼‍♀️ 🙅🏽‍♀️ 🙅🏾‍♀️ 🙅🏿‍♀️"],
      ["🙆",0.6,"person gesturing OK","exercise gesture hand omg","🙆🏻 🙆🏼 🙆🏽 🙆🏾 🙆🏿"],
      ["🙆‍♂️",4,"man gesturing OK","exercise gesture hand omg","🙆🏻‍♂️ 🙆🏼‍♂️ 🙆🏽‍♂️ 🙆🏾‍♂️ 🙆🏿‍♂️"],
      ["🙆‍♀️",4,"woman gesturing OK","exercise gesture hand omg","🙆🏻‍♀️ 🙆🏼‍♀️ 🙆🏽‍♀️ 🙆🏾‍♀️ 🙆🏿‍♀️"],
      ["💁",0.6,"person tipping hand","fetch flick flip gossip sarcasm sarcastic sassy seriously whatever information desk","💁🏻 💁🏼 💁🏽 💁🏾 💁🏿"],
      ["💁‍♂️",4,"man tipping hand","fetch flick flip gossip sarcasm sarcastic sassy seriously whatever","💁🏻‍♂️ 💁🏼‍♂️ 💁🏽‍♂️ 💁🏾‍♂️ 💁🏿‍♂️"],
      ["💁‍♀️",4,"woman tipping hand","fetch flick flip gossip sarcasm sarcastic sassy seriously whatever","💁🏻‍♀️ 💁🏼‍♀️ 💁🏽‍♀️ 💁🏾‍♀️ 💁🏿‍♀️"],
      ["🙋",0.6,"person raising hand","gesture here know me pick question raise","🙋🏻 🙋🏼 🙋🏽 🙋🏾 🙋🏿"],
      ["🙋‍♂️",4,"man raising hand","gesture here know me pick question raise","🙋🏻‍♂️ 🙋🏼‍♂️ 🙋🏽‍♂️ 🙋🏾‍♂️ 🙋🏿‍♂️"],
      ["🙋‍♀️",4,"woman raising hand","gesture here know me pick question raise","🙋🏻‍♀️ 🙋🏼‍♀️ 🙋🏽‍♀️ 🙋🏾‍♀️ 🙋🏿‍♀️"],
      ["🧏",12,"deaf person","accessibility ear gesture hear","🧏🏻 🧏🏼 🧏🏽 🧏🏾 🧏🏿"],
      ["🧏‍♂️",12,"deaf man","accessibility ear gesture hear","🧏🏻‍♂️ 🧏🏼‍♂️ 🧏🏽‍♂️ 🧏🏾‍♂️ 🧏🏿‍♂️"],
      ["🧏‍♀️",12,"deaf woman","accessibility ear gesture hear","🧏🏻‍♀️ 🧏🏼‍♀️ 🧏🏽‍♀️ 🧏🏾‍♀️ 🧏🏿‍♀️"],
      ["🙇",0.6,"person bowing","apology ask beg bow favor forgive gesture meditate meditation pity regret sorry","🙇🏻 🙇🏼 🙇🏽 🙇🏾 🙇🏿"],
      ["🙇‍♂️",4,"man bowing","apology ask beg bow favor forgive gesture meditate meditation pity regret sorry","🙇🏻‍♂️ 🙇🏼‍♂️ 🙇🏽‍♂️ 🙇🏾‍♂️ 🙇🏿‍♂️"],
      ["🙇‍♀️",4,"woman bowing","apology ask beg bow favor forgive gesture meditate meditation pity regret sorry","🙇🏻‍♀️ 🙇🏼‍♀️ 🙇🏽‍♀️ 🙇🏾‍♀️ 🙇🏿‍♀️"],
      ["🤦",3,"person facepalming","again bewilder disbelief exasperation facepalm no not oh omg shock smh","🤦🏻 🤦🏼 🤦🏽 🤦🏾 🤦🏿"],
      ["🤦‍♂️",4,"man facepalming","again bewilder disbelief exasperation facepalm no not oh omg shock smh","🤦🏻‍♂️ 🤦🏼‍♂️ 🤦🏽‍♂️ 🤦🏾‍♂️ 🤦🏿‍♂️"],
      ["🤦‍♀️",4,"woman facepalming","again bewilder disbelief exasperation facepalm no not oh omg shock smh","🤦🏻‍♀️ 🤦🏼‍♀️ 🤦🏽‍♀️ 🤦🏾‍♀️ 🤦🏿‍♀️"],
      ["🤷",3,"person shrugging","doubt dunno guess idk ignorance indifference knows maybe shrug whatever who","🤷🏻 🤷🏼 🤷🏽 🤷🏾 🤷🏿"],
      ["🤷‍♂️",4,"man shrugging","doubt dunno guess idk ignorance indifference knows maybe shrug whatever who","🤷🏻‍♂️ 🤷🏼‍♂️ 🤷🏽‍♂️ 🤷🏾‍♂️ 🤷🏿‍♂️"],
      ["🤷‍♀️",4,"woman shrugging","doubt dunno guess idk ignorance indifference knows maybe shrug whatever who","🤷🏻‍♀️ 🤷🏼‍♀️ 🤷🏽‍♀️ 🤷🏾‍♀️ 🤷🏿‍♀️"],
      ["🧑‍⚕️",12.1,"health worker","doctor healthcare nurse therapist","🧑🏻‍⚕️ 🧑🏼‍⚕️ 🧑🏽‍⚕️ 🧑🏾‍⚕️ 🧑🏿‍⚕️"],
      ["👨‍⚕️",4,"man health worker","doctor healthcare nurse therapist","👨🏻‍⚕️ 👨🏼‍⚕️ 👨🏽‍⚕️ 👨🏾‍⚕️ 👨🏿‍⚕️"],
      ["👩‍⚕️",4,"woman health worker","doctor healthcare nurse therapist","👩🏻‍⚕️ 👩🏼‍⚕️ 👩🏽‍⚕️ 👩🏾‍⚕️ 👩🏿‍⚕️"],
      ["🧑‍🎓",12.1,"student","graduate","🧑🏻‍🎓 🧑🏼‍🎓 🧑🏽‍🎓 🧑🏾‍🎓 🧑🏿‍🎓"],
      ["👨‍🎓",4,"man student","graduate","👨🏻‍🎓 👨🏼‍🎓 👨🏽‍🎓 👨🏾‍🎓 👨🏿‍🎓"],
      ["👩‍🎓",4,"woman student","graduate","👩🏻‍🎓 👩🏼‍🎓 👩🏽‍🎓 👩🏾‍🎓 👩🏿‍🎓"],
      ["🧑‍🏫",12.1,"teacher","instructor lecturer professor","🧑🏻‍🏫 🧑🏼‍🏫 🧑🏽‍🏫 🧑🏾‍🏫 🧑🏿‍🏫"],
      ["👨‍🏫",4,"man teacher","instructor lecturer professor","👨🏻‍🏫 👨🏼‍🏫 👨🏽‍🏫 👨🏾‍🏫 👨🏿‍🏫"],
      ["👩‍🏫",4,"woman teacher","instructor lecturer professor","👩🏻‍🏫 👩🏼‍🏫 👩🏽‍🏫 👩🏾‍🏫 👩🏿‍🏫"],
      ["🧑‍⚖️",12.1,"judge","justice law scales","🧑🏻‍⚖️ 🧑🏼‍⚖️ 🧑🏽‍⚖️ 🧑🏾‍⚖️ 🧑🏿‍⚖️"],
      ["👨‍⚖️",4,"man judge","justice law scales","👨🏻‍⚖️ 👨🏼‍⚖️ 👨🏽‍⚖️ 👨🏾‍⚖️ 👨🏿‍⚖️"],
      ["👩‍⚖️",4,"woman judge","justice law scales","👩🏻‍⚖️ 👩🏼‍⚖️ 👩🏽‍⚖️ 👩🏾‍⚖️ 👩🏿‍⚖️"],
      ["🧑‍🌾",12.1,"farmer","gardener rancher","🧑🏻‍🌾 🧑🏼‍🌾 🧑🏽‍🌾 🧑🏾‍🌾 🧑🏿‍🌾"],
      ["👨‍🌾",4,"man farmer","gardener rancher","👨🏻‍🌾 👨🏼‍🌾 👨🏽‍🌾 👨🏾‍🌾 👨🏿‍🌾"],
      ["👩‍🌾",4,"woman farmer","gardener rancher","👩🏻‍🌾 👩🏼‍🌾 👩🏽‍🌾 👩🏾‍🌾 👩🏿‍🌾"],
      ["🧑‍🍳",12.1,"cook","chef","🧑🏻‍🍳 🧑🏼‍🍳 🧑🏽‍🍳 🧑🏾‍🍳 🧑🏿‍🍳"],
      ["👨‍🍳",4,"man cook","chef","👨🏻‍🍳 👨🏼‍🍳 👨🏽‍🍳 👨🏾‍🍳 👨🏿‍🍳"],
      ["👩‍🍳",4,"woman cook","chef","👩🏻‍🍳 👩🏼‍🍳 👩🏽‍🍳 👩🏾‍🍳 👩🏿‍🍳"],
      ["🧑‍🔧",12.1,"mechanic","electrician plumber tradesperson","🧑🏻‍🔧 🧑🏼‍🔧 🧑🏽‍🔧 🧑🏾‍🔧 🧑🏿‍🔧"],
      ["👨‍🔧",4,"man mechanic","electrician plumber tradesperson","👨🏻‍🔧 👨🏼‍🔧 👨🏽‍🔧 👨🏾‍🔧 👨🏿‍🔧"],
      ["👩‍🔧",4,"woman mechanic","electrician plumber tradesperson","👩🏻‍🔧 👩🏼‍🔧 👩🏽‍🔧 👩🏾‍🔧 👩🏿‍🔧"],
      ["🧑‍🏭",12.1,"factory worker","assembly industrial","🧑🏻‍🏭 🧑🏼‍🏭 🧑🏽‍🏭 🧑🏾‍🏭 🧑🏿‍🏭"],
      ["👨‍🏭",4,"man factory worker","assembly industrial","👨🏻‍🏭 👨🏼‍🏭 👨🏽‍🏭 👨🏾‍🏭 👨🏿‍🏭"],
      ["👩‍🏭",4,"woman factory worker","assembly industrial","👩🏻‍🏭 👩🏼‍🏭 👩🏽‍🏭 👩🏾‍🏭 👩🏿‍🏭"],
      ["🧑‍💼",12.1,"office worker","architect business manager white-collar","🧑🏻‍💼 🧑🏼‍💼 🧑🏽‍💼 🧑🏾‍💼 🧑🏿‍💼"],
      ["👨‍💼",4,"man office worker","architect business manager white-collar","👨🏻‍💼 👨🏼‍💼 👨🏽‍💼 👨🏾‍💼 👨🏿‍💼"],
      ["👩‍💼",4,"woman office worker","architect business manager white-collar","👩🏻‍💼 👩🏼‍💼 👩🏽‍💼 👩🏾‍💼 👩🏿‍💼"],
      ["🧑‍🔬",12.1,"scientist","biologist chemist engineer mathematician physicist","🧑🏻‍🔬 🧑🏼‍🔬 🧑🏽‍🔬 🧑🏾‍🔬 🧑🏿‍🔬"],
      ["👨‍🔬",4,"man scientist","biologist chemist engineer mathematician physicist","👨🏻‍🔬 👨🏼‍🔬 👨🏽‍🔬 👨🏾‍🔬 👨🏿‍🔬"],
      ["👩‍🔬",4,"woman scientist","biologist chemist engineer mathematician physicist","👩🏻‍🔬 👩🏼‍🔬 👩🏽‍🔬 👩🏾‍🔬 👩🏿‍🔬"],
      ["🧑‍💻",12.1,"technologist","coder computer developer inventor software","🧑🏻‍💻 🧑🏼‍💻 🧑🏽‍💻 🧑🏾‍💻 🧑🏿‍💻"],
      ["👨‍💻",4,"man technologist","coder computer developer inventor software","👨🏻‍💻 👨🏼‍💻 👨🏽‍💻 👨🏾‍💻 👨🏿‍💻"],
      ["👩‍💻",4,"woman technologist","coder computer developer inventor software","👩🏻‍💻 👩🏼‍💻 👩🏽‍💻 👩🏾‍💻 👩🏿‍💻"],
      ["🧑‍🎤",12.1,"singer","actor entertainer rock rockstar star","🧑🏻‍🎤 🧑🏼‍🎤 🧑🏽‍🎤 🧑🏾‍🎤 🧑🏿‍🎤"],
      ["👨‍🎤",4,"man singer","actor entertainer rock rockstar star","👨🏻‍🎤 👨🏼‍🎤 👨🏽‍🎤 👨🏾‍🎤 👨🏿‍🎤"],
      ["👩‍🎤",4,"woman singer","actor entertainer rock rockstar star","👩🏻‍🎤 👩🏼‍🎤 👩🏽‍🎤 👩🏾‍🎤 👩🏿‍🎤"],
      ["🧑‍🎨",12.1,"artist","palette","🧑🏻‍🎨 🧑🏼‍🎨 🧑🏽‍🎨 🧑🏾‍🎨 🧑🏿‍🎨"],
      ["👨‍🎨",4,"man artist","palette","👨🏻‍🎨 👨🏼‍🎨 👨🏽‍🎨 👨🏾‍🎨 👨🏿‍🎨"],
      ["👩‍🎨",4,"woman artist","palette","👩🏻‍🎨 👩🏼‍🎨 👩🏽‍🎨 👩🏾‍🎨 👩🏿‍🎨"],
      ["🧑‍✈️",12.1,"pilot","plane","🧑🏻‍✈️ 🧑🏼‍✈️ 🧑🏽‍✈️ 🧑🏾‍✈️ 🧑🏿‍✈️"],
      ["👨‍✈️",4,"man pilot","plane","👨🏻‍✈️ 👨🏼‍✈️ 👨🏽‍✈️ 👨🏾‍✈️ 👨🏿‍✈️"],
      ["👩‍✈️",4,"woman pilot","plane","👩🏻‍✈️ 👩🏼‍✈️ 👩🏽‍✈️ 👩🏾‍✈️ 👩🏿‍✈️"],
      ["🧑‍🚀",12.1,"astronaut","rocket space","🧑🏻‍🚀 🧑🏼‍🚀 🧑🏽‍🚀 🧑🏾‍🚀 🧑🏿‍🚀"],
      ["👨‍🚀",4,"man astronaut","rocket space","👨🏻‍🚀 👨🏼‍🚀 👨🏽‍🚀 👨🏾‍🚀 👨🏿‍🚀"],
      ["👩‍🚀",4,"woman astronaut","rocket space","👩🏻‍🚀 👩🏼‍🚀 👩🏽‍🚀 👩🏾‍🚀 👩🏿‍🚀"],
      ["🧑‍🚒",12.1,"firefighter","fire firetruck","🧑🏻‍🚒 🧑🏼‍🚒 🧑🏽‍🚒 🧑🏾‍🚒 🧑🏿‍🚒"],
      ["👨‍🚒",4,"man firefighter","fire firetruck","👨🏻‍🚒 👨🏼‍🚒 👨🏽‍🚒 👨🏾‍🚒 👨🏿‍🚒"],
      ["👩‍🚒",4,"woman firefighter","fire firetruck","👩🏻‍🚒 👩🏼‍🚒 👩🏽‍🚒 👩🏾‍🚒 👩🏿‍🚒"],
      ["👮",0.6,"police officer","apprehend arrest citation cop law over pulled undercover","👮🏻 👮🏼 👮🏽 👮🏾 👮🏿"],
      ["👮‍♂️",4,"man police officer","apprehend arrest citation cop law over pulled undercover policeman","👮🏻‍♂️ 👮🏼‍♂️ 👮🏽‍♂️ 👮🏾‍♂️ 👮🏿‍♂️"],
      ["👮‍♀️",4,"woman police officer","apprehend arrest citation cop law over pulled undercover policewoman","👮🏻‍♀️ 👮🏼‍♀️ 👮🏽‍♀️ 👮🏾‍♀️ 👮🏿‍♀️"],
      ["🕵️",0.7,"detective","sleuth spy","🕵🏻 🕵🏼 🕵🏽 🕵🏾 🕵🏿"],
      ["🕵️‍♂️",4,"man detective","sleuth spy male","🕵🏻‍♂️ 🕵🏼‍♂️ 🕵🏽‍♂️ 🕵🏾‍♂️ 🕵🏿‍♂️"],
      ["🕵️‍♀️",4,"woman detective","sleuth spy female","🕵🏻‍♀️ 🕵🏼‍♀️ 🕵🏽‍♀️ 🕵🏾‍♀️ 🕵🏿‍♀️"],
      ["💂",0.6,"guard","buckingham helmet london palace","💂🏻 💂🏼 💂🏽 💂🏾 💂🏿"],
      ["💂‍♂️",4,"man guard","buckingham helmet london palace guardsman","💂🏻‍♂️ 💂🏼‍♂️ 💂🏽‍♂️ 💂🏾‍♂️ 💂🏿‍♂️"],
      ["💂‍♀️",4,"woman guard","buckingham helmet london palace guardswoman","💂🏻‍♀️ 💂🏼‍♀️ 💂🏽‍♀️ 💂🏾‍♀️ 💂🏿‍♀️"],
      ["🥷",13,"ninja","assassin fight fighter hidden person secret skills sly soldier stealth war","🥷🏻 🥷🏼 🥷🏽 🥷🏾 🥷🏿"],
      ["👷",0.6,"construction worker","build fix hardhat hat man person rebuild remodel repair work","👷🏻 👷🏼 👷🏽 👷🏾 👷🏿"],
      ["👷‍♂️",4,"man construction worker","build fix hardhat hat rebuild remodel repair work","👷🏻‍♂️ 👷🏼‍♂️ 👷🏽‍♂️ 👷🏾‍♂️ 👷🏿‍♂️"],
      ["👷‍♀️",4,"woman construction worker","build fix hardhat hat man rebuild remodel repair work","👷🏻‍♀️ 👷🏼‍♀️ 👷🏽‍♀️ 👷🏾‍♀️ 👷🏿‍♀️"],
      ["🫅",14,"person with crown","monarch noble regal royal royalty","🫅🏻 🫅🏼 🫅🏽 🫅🏾 🫅🏿"],
      ["🤴",3,"prince","crown fairy fairytale fantasy king royal royalty tale","🤴🏻 🤴🏼 🤴🏽 🤴🏾 🤴🏿"],
      ["👸",0.6,"princess","crown fairy fairytale fantasy queen royal royalty tale","👸🏻 👸🏼 👸🏽 👸🏾 👸🏿"],
      ["👳",0.6,"person wearing turban","with","👳🏻 👳🏼 👳🏽 👳🏾 👳🏿"],
      ["👳‍♂️",4,"man wearing turban","with","👳🏻‍♂️ 👳🏼‍♂️ 👳🏽‍♂️ 👳🏾‍♂️ 👳🏿‍♂️"],
      ["👳‍♀️",4,"woman wearing turban","with","👳🏻‍♀️ 👳🏼‍♀️ 👳🏽‍♀️ 👳🏾‍♀️ 👳🏿‍♀️"],
      ["👲",0.6,"person with skullcap","chinese cap gua guapi hat mao pi man","👲🏻 👲🏼 👲🏽 👲🏾 👲🏿"],
      ["🧕",5,"woman with headscarf","bandana head hijab kerchief mantilla tichel","🧕🏻 🧕🏼 🧕🏽 🧕🏾 🧕🏿"],
      ["🤵",3,"person in tuxedo","formal wedding","🤵🏻 🤵🏼 🤵🏽 🤵🏾 🤵🏿"],
      ["🤵‍♂️",13,"man in tuxedo","formal groom wedding","🤵🏻‍♂️ 🤵🏼‍♂️ 🤵🏽‍♂️ 🤵🏾‍♂️ 🤵🏿‍♂️"],
      ["🤵‍♀️",13,"woman in tuxedo","formal wedding","🤵🏻‍♀️ 🤵🏼‍♀️ 🤵🏽‍♀️ 🤵🏾‍♀️ 🤵🏿‍♀️"],
      ["👰",0.6,"person with veil","wedding","👰🏻 👰🏼 👰🏽 👰🏾 👰🏿"],
      ["👰‍♂️",13,"man with veil","wedding","👰🏻‍♂️ 👰🏼‍♂️ 👰🏽‍♂️ 👰🏾‍♂️ 👰🏿‍♂️"],
      ["👰‍♀️",13,"woman with veil","bride wedding","👰🏻‍♀️ 👰🏼‍♀️ 👰🏽‍♀️ 👰🏾‍♀️ 👰🏿‍♀️"],
      ["🤰",3,"pregnant woman","","🤰🏻 🤰🏼 🤰🏽 🤰🏾 🤰🏿"],
      ["🫃",14,"pregnant man","belly bloated full overeat","🫃🏻 🫃🏼 🫃🏽 🫃🏾 🫃🏿"],
      ["🫄",14,"pregnant person","belly bloated full overeat stuffed","🫄🏻 🫄🏼 🫄🏽 🫄🏾 🫄🏿"],
      ["🤱",5,"breast-feeding","baby breast feeding mom mother nursing woman","🤱🏻 🤱🏼 🤱🏽 🤱🏾 🤱🏿"],
      ["👩‍🍼",13,"woman feeding baby","feed mom mother nanny newborn nursing","👩🏻‍🍼 👩🏼‍🍼 👩🏽‍🍼 👩🏾‍🍼 👩🏿‍🍼"],
      ["👨‍🍼",13,"man feeding baby","dad father feed nanny newborn nursing","👨🏻‍🍼 👨🏼‍🍼 👨🏽‍🍼 👨🏾‍🍼 👨🏿‍🍼"],
      ["🧑‍🍼",13,"person feeding baby","feed nanny newborn nursing parent","🧑🏻‍🍼 🧑🏼‍🍼 🧑🏽‍🍼 🧑🏾‍🍼 🧑🏿‍🍼"],
      ["👼",0.6,"baby angel","church face fairy fairytale fantasy tale","👼🏻 👼🏼 👼🏽 👼🏾 👼🏿"],
      ["🎅",0.6,"Santa Claus","christmas celebration fairy fantasy father holiday merry tale xmas","🎅🏻 🎅🏼 🎅🏽 🎅🏾 🎅🏿"],
      ["🤶",3,"Mrs. Claus","christmas mrs celebration fairy fantasy holiday merry mother santa tale xmas","🤶🏻 🤶🏼 🤶🏽 🤶🏾 🤶🏿"],
      ["🧑‍🎄",13,"Mx Claus","christmas celebration fairy fantasy holiday merry santa tale xmas","🧑🏻‍🎄 🧑🏼‍🎄 🧑🏽‍🎄 🧑🏾‍🎄 🧑🏿‍🎄"],
      ["🦸",11,"superhero","good hero superpower","🦸🏻 🦸🏼 🦸🏽 🦸🏾 🦸🏿"],
      ["🦸‍♂️",11,"man superhero","good hero superpower","🦸🏻‍♂️ 🦸🏼‍♂️ 🦸🏽‍♂️ 🦸🏾‍♂️ 🦸🏿‍♂️"],
      ["🦸‍♀️",11,"woman superhero","good hero heroine superpower","🦸🏻‍♀️ 🦸🏼‍♀️ 🦸🏽‍♀️ 🦸🏾‍♀️ 🦸🏿‍♀️"],
      ["🦹",11,"supervillain","bad criminal evil superpower villain","🦹🏻 🦹🏼 🦹🏽 🦹🏾 🦹🏿"],
      ["🦹‍♂️",11,"man supervillain","bad criminal evil superpower villain","🦹🏻‍♂️ 🦹🏼‍♂️ 🦹🏽‍♂️ 🦹🏾‍♂️ 🦹🏿‍♂️"],
      ["🦹‍♀️",11,"woman supervillain","bad criminal evil superpower villain","🦹🏻‍♀️ 🦹🏼‍♀️ 🦹🏽‍♀️ 🦹🏾‍♀️ 🦹🏿‍♀️"],
      ["🧙",5,"mage","fantasy magic play sorcerer sorceress sorcery spell summon witch wizard","🧙🏻 🧙🏼 🧙🏽 🧙🏾 🧙🏿"],
      ["🧙‍♂️",5,"man mage","fantasy magic play sorcerer sorceress sorcery spell summon witch wizard","🧙🏻‍♂️ 🧙🏼‍♂️ 🧙🏽‍♂️ 🧙🏾‍♂️ 🧙🏿‍♂️"],
      ["🧙‍♀️",5,"woman mage","fantasy magic play sorcerer sorceress sorcery spell summon witch wizard","🧙🏻‍♀️ 🧙🏼‍♀️ 🧙🏽‍♀️ 🧙🏾‍♀️ 🧙🏿‍♀️"],
      ["🧚",5,"fairy","fairytale fantasy myth person pixie tale wings","🧚🏻 🧚🏼 🧚🏽 🧚🏾 🧚🏿"],
      ["🧚‍♂️",5,"man fairy","oberon puck fairytale fantasy myth person pixie tale wings","🧚🏻‍♂️ 🧚🏼‍♂️ 🧚🏽‍♂️ 🧚🏾‍♂️ 🧚🏿‍♂️"],
      ["🧚‍♀️",5,"woman fairy","titania fairytale fantasy myth person pixie tale wings","🧚🏻‍♀️ 🧚🏼‍♀️ 🧚🏽‍♀️ 🧚🏾‍♀️ 🧚🏿‍♀️"],
      ["🧛",5,"vampire","dracula blood fangs halloween scary supernatural teeth undead","🧛🏻 🧛🏼 🧛🏽 🧛🏾 🧛🏿"],
      ["🧛‍♂️",5,"man vampire","blood fangs halloween scary supernatural teeth undead","🧛🏻‍♂️ 🧛🏼‍♂️ 🧛🏽‍♂️ 🧛🏾‍♂️ 🧛🏿‍♂️"],
      ["🧛‍♀️",5,"woman vampire","blood fangs halloween scary supernatural teeth undead","🧛🏻‍♀️ 🧛🏼‍♀️ 🧛🏽‍♀️ 🧛🏾‍♀️ 🧛🏿‍♀️"],
      ["🧜",5,"merperson","creature fairytale folklore ocean sea siren trident","🧜🏻 🧜🏼 🧜🏽 🧜🏾 🧜🏿"],
      ["🧜‍♂️",5,"merman","neptune poseidon triton creature fairytale folklore ocean sea siren trident","🧜🏻‍♂️ 🧜🏼‍♂️ 🧜🏽‍♂️ 🧜🏾‍♂️ 🧜🏿‍♂️"],
      ["🧜‍♀️",5,"mermaid","creature fairytale folklore merwoman ocean sea siren trident","🧜🏻‍♀️ 🧜🏼‍♀️ 🧜🏽‍♀️ 🧜🏾‍♀️ 🧜🏿‍♀️"],
      ["🧝",5,"elf","elves enchantment fantasy folklore magic magical myth","🧝🏻 🧝🏼 🧝🏽 🧝🏾 🧝🏿"],
      ["🧝‍♂️",5,"man elf","elves enchantment fantasy folklore magic magical myth","🧝🏻‍♂️ 🧝🏼‍♂️ 🧝🏽‍♂️ 🧝🏾‍♂️ 🧝🏿‍♂️"],
      ["🧝‍♀️",5,"woman elf","elves enchantment fantasy folklore magic magical myth","🧝🏻‍♀️ 🧝🏼‍♀️ 🧝🏽‍♀️ 🧝🏾‍♀️ 🧝🏿‍♀️"],
      ["🧞",5,"genie","djinn fantasy jinn lamp myth rub wishes"],
      ["🧞‍♂️",5,"man genie","djinn fantasy jinn lamp myth rub wishes"],
      ["🧞‍♀️",5,"woman genie","djinn fantasy jinn lamp myth rub wishes"],
      ["🧟",5,"zombie","apocalypse dead halloween horror scary undead walking"],
      ["🧟‍♂️",5,"man zombie","apocalypse dead halloween horror scary undead walking"],
      ["🧟‍♀️",5,"woman zombie","apocalypse dead halloween horror scary undead walking"],
      ["🧌",14,"troll","fairy fantasy monster tale trolling"],
      ["🫈",17,"hairy creature","bigfoot cryptid forest giant sasquatch woodwose yeti"],
      ["💆",0.6,"person getting massage","face headache relax relaxing salon soothe spa tension therapy treatment","💆🏻 💆🏼 💆🏽 💆🏾 💆🏿"],
      ["💆‍♂️",4,"man getting massage","face headache relax relaxing salon soothe spa tension therapy treatment","💆🏻‍♂️ 💆🏼‍♂️ 💆🏽‍♂️ 💆🏾‍♂️ 💆🏿‍♂️"],
      ["💆‍♀️",4,"woman getting massage","face headache relax relaxing salon soothe spa tension therapy treatment","💆🏻‍♀️ 💆🏼‍♀️ 💆🏽‍♀️ 💆🏾‍♀️ 💆🏿‍♀️"],
      ["💇",0.6,"person getting haircut","barber beauty chop cosmetology cut groom hair parlor shears style","💇🏻 💇🏼 💇🏽 💇🏾 💇🏿"],
      ["💇‍♂️",4,"man getting haircut","barber beauty chop cosmetology cut groom hair parlor person shears style","💇🏻‍♂️ 💇🏼‍♂️ 💇🏽‍♂️ 💇🏾‍♂️ 💇🏿‍♂️"],
      ["💇‍♀️",4,"woman getting haircut","barber beauty chop cosmetology cut groom hair parlor person shears style","💇🏻‍♀️ 💇🏼‍♀️ 💇🏽‍♀️ 💇🏾‍♀️ 💇🏿‍♀️"],
      ["🚶",0.6,"person walking","amble gait hike man pace pedestrian stride stroll walk","🚶🏻 🚶🏼 🚶🏽 🚶🏾 🚶🏿"],
      ["🚶‍♂️",4,"man walking","amble gait hike pace pedestrian stride stroll walk","🚶🏻‍♂️ 🚶🏼‍♂️ 🚶🏽‍♂️ 🚶🏾‍♂️ 🚶🏿‍♂️"],
      ["🚶‍♀️",4,"woman walking","amble gait hike man pace pedestrian stride stroll walk","🚶🏻‍♀️ 🚶🏼‍♀️ 🚶🏽‍♀️ 🚶🏾‍♀️ 🚶🏿‍♀️"],
      ["🚶‍➡️",15.1,"person walking: facing right","amble gait hike man pace pedestrian stride stroll walk","🚶🏻‍➡️ 🚶🏼‍➡️ 🚶🏽‍➡️ 🚶🏾‍➡️ 🚶🏿‍➡️"],
      ["🚶‍♀️‍➡️",15.1,"woman walking: facing right","amble gait hike man pace pedestrian stride stroll walk","🚶🏻‍♀️‍➡️ 🚶🏼‍♀️‍➡️ 🚶🏽‍♀️‍➡️ 🚶🏾‍♀️‍➡️ 🚶🏿‍♀️‍➡️"],
      ["🚶‍♂️‍➡️",15.1,"man walking: facing right","amble gait hike pace pedestrian stride stroll walk","🚶🏻‍♂️‍➡️ 🚶🏼‍♂️‍➡️ 🚶🏽‍♂️‍➡️ 🚶🏾‍♂️‍➡️ 🚶🏿‍♂️‍➡️"],
      ["🧍",12,"person standing","stand","🧍🏻 🧍🏼 🧍🏽 🧍🏾 🧍🏿"],
      ["🧍‍♂️",12,"man standing","stand","🧍🏻‍♂️ 🧍🏼‍♂️ 🧍🏽‍♂️ 🧍🏾‍♂️ 🧍🏿‍♂️"],
      ["🧍‍♀️",12,"woman standing","stand","🧍🏻‍♀️ 🧍🏼‍♀️ 🧍🏽‍♀️ 🧍🏾‍♀️ 🧍🏿‍♀️"],
      ["🧎",12,"person kneeling","kneel knees","🧎🏻 🧎🏼 🧎🏽 🧎🏾 🧎🏿"],
      ["🧎‍♂️",12,"man kneeling","kneel knees","🧎🏻‍♂️ 🧎🏼‍♂️ 🧎🏽‍♂️ 🧎🏾‍♂️ 🧎🏿‍♂️"],
      ["🧎‍♀️",12,"woman kneeling","kneel knees","🧎🏻‍♀️ 🧎🏼‍♀️ 🧎🏽‍♀️ 🧎🏾‍♀️ 🧎🏿‍♀️"],
      ["🧎‍➡️",15.1,"person kneeling: facing right","kneel knees","🧎🏻‍➡️ 🧎🏼‍➡️ 🧎🏽‍➡️ 🧎🏾‍➡️ 🧎🏿‍➡️"],
      ["🧎‍♀️‍➡️",15.1,"woman kneeling: facing right","kneel knees","🧎🏻‍♀️‍➡️ 🧎🏼‍♀️‍➡️ 🧎🏽‍♀️‍➡️ 🧎🏾‍♀️‍➡️ 🧎🏿‍♀️‍➡️"],
      ["🧎‍♂️‍➡️",15.1,"man kneeling: facing right","kneel knees","🧎🏻‍♂️‍➡️ 🧎🏼‍♂️‍➡️ 🧎🏽‍♂️‍➡️ 🧎🏾‍♂️‍➡️ 🧎🏿‍♂️‍➡️"],
      ["🧑‍🦯",12.1,"person with white cane","accessibility blind probing","🧑🏻‍🦯 🧑🏼‍🦯 🧑🏽‍🦯 🧑🏾‍🦯 🧑🏿‍🦯"],
      ["🧑‍🦯‍➡️",15.1,"person with white cane: facing right","accessibility blind probing","🧑🏻‍🦯‍➡️ 🧑🏼‍🦯‍➡️ 🧑🏽‍🦯‍➡️ 🧑🏾‍🦯‍➡️ 🧑🏿‍🦯‍➡️"],
      ["👨‍🦯",12,"man with white cane","accessibility blind probing","👨🏻‍🦯 👨🏼‍🦯 👨🏽‍🦯 👨🏾‍🦯 👨🏿‍🦯"],
      ["👨‍🦯‍➡️",15.1,"man with white cane: facing right","accessibility blind probing","👨🏻‍🦯‍➡️ 👨🏼‍🦯‍➡️ 👨🏽‍🦯‍➡️ 👨🏾‍🦯‍➡️ 👨🏿‍🦯‍➡️"],
      ["👩‍🦯",12,"woman with white cane","accessibility blind probing","👩🏻‍🦯 👩🏼‍🦯 👩🏽‍🦯 👩🏾‍🦯 👩🏿‍🦯"],
      ["👩‍🦯‍➡️",15.1,"woman with white cane: facing right","accessibility blind probing","👩🏻‍🦯‍➡️ 👩🏼‍🦯‍➡️ 👩🏽‍🦯‍➡️ 👩🏾‍🦯‍➡️ 👩🏿‍🦯‍➡️"],
      ["🧑‍🦼",12.1,"person in motorized wheelchair","accessibility","🧑🏻‍🦼 🧑🏼‍🦼 🧑🏽‍🦼 🧑🏾‍🦼 🧑🏿‍🦼"],
      ["🧑‍🦼‍➡️",15.1,"person in motorized wheelchair: facing right","accessibility","🧑🏻‍🦼‍➡️ 🧑🏼‍🦼‍➡️ 🧑🏽‍🦼‍➡️ 🧑🏾‍🦼‍➡️ 🧑🏿‍🦼‍➡️"],
      ["👨‍🦼",12,"man in motorized wheelchair","accessibility","👨🏻‍🦼 👨🏼‍🦼 👨🏽‍🦼 👨🏾‍🦼 👨🏿‍🦼"],
      ["👨‍🦼‍➡️",15.1,"man in motorized wheelchair: facing right","accessibility","👨🏻‍🦼‍➡️ 👨🏼‍🦼‍➡️ 👨🏽‍🦼‍➡️ 👨🏾‍🦼‍➡️ 👨🏿‍🦼‍➡️"],
      ["👩‍🦼",12,"woman in motorized wheelchair","accessibility","👩🏻‍🦼 👩🏼‍🦼 👩🏽‍🦼 👩🏾‍🦼 👩🏿‍🦼"],
      ["👩‍🦼‍➡️",15.1,"woman in motorized wheelchair: facing right","accessibility","👩🏻‍🦼‍➡️ 👩🏼‍🦼‍➡️ 👩🏽‍🦼‍➡️ 👩🏾‍🦼‍➡️ 👩🏿‍🦼‍➡️"],
      ["🧑‍🦽",12.1,"person in manual wheelchair","accessibility","🧑🏻‍🦽 🧑🏼‍🦽 🧑🏽‍🦽 🧑🏾‍🦽 🧑🏿‍🦽"],
      ["🧑‍🦽‍➡️",15.1,"person in manual wheelchair: facing right","accessibility","🧑🏻‍🦽‍➡️ 🧑🏼‍🦽‍➡️ 🧑🏽‍🦽‍➡️ 🧑🏾‍🦽‍➡️ 🧑🏿‍🦽‍➡️"],
      ["👨‍🦽",12,"man in manual wheelchair","accessibility","👨🏻‍🦽 👨🏼‍🦽 👨🏽‍🦽 👨🏾‍🦽 👨🏿‍🦽"],
      ["👨‍🦽‍➡️",15.1,"man in manual wheelchair: facing right","accessibility","👨🏻‍🦽‍➡️ 👨🏼‍🦽‍➡️ 👨🏽‍🦽‍➡️ 👨🏾‍🦽‍➡️ 👨🏿‍🦽‍➡️"],
      ["👩‍🦽",12,"woman in manual wheelchair","accessibility","👩🏻‍🦽 👩🏼‍🦽 👩🏽‍🦽 👩🏾‍🦽 👩🏿‍🦽"],
      ["👩‍🦽‍➡️",15.1,"woman in manual wheelchair: facing right","accessibility","👩🏻‍🦽‍➡️ 👩🏼‍🦽‍➡️ 👩🏽‍🦽‍➡️ 👩🏾‍🦽‍➡️ 👩🏿‍🦽‍➡️"],
      ["🏃",0.6,"person running","fast hurry marathon move quick race racing run rush speed runner","🏃🏻 🏃🏼 🏃🏽 🏃🏾 🏃🏿"],
      ["🏃‍♂️",4,"man running","fast hurry marathon move quick race racing run rush speed","🏃🏻‍♂️ 🏃🏼‍♂️ 🏃🏽‍♂️ 🏃🏾‍♂️ 🏃🏿‍♂️"],
      ["🏃‍♀️",4,"woman running","fast hurry marathon move quick race racing run rush speed","🏃🏻‍♀️ 🏃🏼‍♀️ 🏃🏽‍♀️ 🏃🏾‍♀️ 🏃🏿‍♀️"],
      ["🏃‍➡️",15.1,"person running: facing right","fast hurry marathon move quick race racing run rush speed","🏃🏻‍➡️ 🏃🏼‍➡️ 🏃🏽‍➡️ 🏃🏾‍➡️ 🏃🏿‍➡️"],
      ["🏃‍♀️‍➡️",15.1,"woman running: facing right","fast hurry marathon move quick race racing run rush speed","🏃🏻‍♀️‍➡️ 🏃🏼‍♀️‍➡️ 🏃🏽‍♀️‍➡️ 🏃🏾‍♀️‍➡️ 🏃🏿‍♀️‍➡️"],
      ["🏃‍♂️‍➡️",15.1,"man running: facing right","fast hurry marathon move quick race racing run rush speed","🏃🏻‍♂️‍➡️ 🏃🏼‍♂️‍➡️ 🏃🏽‍♂️‍➡️ 🏃🏾‍♂️‍➡️ 🏃🏿‍♂️‍➡️"],
      ["🧑‍🩰",17,"ballet dancer","","🧑🏻‍🩰 🧑🏼‍🩰 🧑🏽‍🩰 🧑🏾‍🩰 🧑🏿‍🩰"],
      ["💃",0.6,"woman dancing","dance dancer elegant festive flair flamenco groove let’s salsa tango","💃🏻 💃🏼 💃🏽 💃🏾 💃🏿"],
      ["🕺",3,"man dancing","dance dancer elegant festive flair flamenco groove let’s salsa tango","🕺🏻 🕺🏼 🕺🏽 🕺🏾 🕺🏿"],
      ["🕴️",0.7,"person in suit levitating","business","🕴🏻 🕴🏼 🕴🏽 🕴🏾 🕴🏿"],
      ["👯",0.6,"people with bunny ears","bestie bff counterpart dancer double ear identical pair party partying soulmate twin twinsies dancers","👯🏻 👯🏼 👯🏽 👯🏾 👯🏿"],
      ["👯‍♂️",4,"men with bunny ears","bestie bff counterpart dancer double ear identical pair party partying people soulmate twin twinsies dancing","👯🏻‍♂️ 👯🏼‍♂️ 👯🏽‍♂️ 👯🏾‍♂️ 👯🏿‍♂️"],
      ["👯‍♀️",4,"women with bunny ears","bestie bff counterpart dancer double ear identical pair party partying people soulmate twin twinsies dancing","👯🏻‍♀️ 👯🏼‍♀️ 👯🏽‍♀️ 👯🏾‍♀️ 👯🏿‍♀️"],
      ["🧖",5,"person in steamy room","day luxurious pamper relax sauna spa steam steambath unwind","🧖🏻 🧖🏼 🧖🏽 🧖🏾 🧖🏿"],
      ["🧖‍♂️",5,"man in steamy room","day luxurious pamper relax sauna spa steam steambath unwind","🧖🏻‍♂️ 🧖🏼‍♂️ 🧖🏽‍♂️ 🧖🏾‍♂️ 🧖🏿‍♂️"],
      ["🧖‍♀️",5,"woman in steamy room","day luxurious pamper relax sauna spa steam steambath unwind","🧖🏻‍♀️ 🧖🏼‍♀️ 🧖🏽‍♀️ 🧖🏾‍♀️ 🧖🏿‍♀️"],
      ["🧗",5,"person climbing","climb climber mountain rock scale up","🧗🏻 🧗🏼 🧗🏽 🧗🏾 🧗🏿"],
      ["🧗‍♂️",5,"man climbing","climb climber mountain rock scale up","🧗🏻‍♂️ 🧗🏼‍♂️ 🧗🏽‍♂️ 🧗🏾‍♂️ 🧗🏿‍♂️"],
      ["🧗‍♀️",5,"woman climbing","climb climber mountain rock scale up","🧗🏻‍♀️ 🧗🏼‍♀️ 🧗🏽‍♀️ 🧗🏾‍♀️ 🧗🏿‍♀️"],
      ["🤺",3,"person fencing","fencer sword"],
      ["🏇",1,"horse racing","jockey racehorse riding sport","🏇🏻 🏇🏼 🏇🏽 🏇🏾 🏇🏿"],
      ["⛷️",0.7,"skier","ski snow"],
      ["🏂",0.6,"snowboarder","ski snow snowboard sport","🏂🏻 🏂🏼 🏂🏽 🏂🏾 🏂🏿"],
      ["🏌️",0.7,"person golfing","ball birdie caddy driving golf green pga putt range tee","🏌🏻 🏌🏼 🏌🏽 🏌🏾 🏌🏿"],
      ["🏌️‍♂️",4,"man golfing","ball birdie caddy driving golf green pga putt range tee","🏌🏻‍♂️ 🏌🏼‍♂️ 🏌🏽‍♂️ 🏌🏾‍♂️ 🏌🏿‍♂️"],
      ["🏌️‍♀️",4,"woman golfing","ball birdie caddy driving golf green pga putt range tee","🏌🏻‍♀️ 🏌🏼‍♀️ 🏌🏽‍♀️ 🏌🏾‍♀️ 🏌🏿‍♀️"],
      ["🏄",0.6,"person surfing","beach ocean sport surf surfer swell waves","🏄🏻 🏄🏼 🏄🏽 🏄🏾 🏄🏿"],
      ["🏄‍♂️",4,"man surfing","beach ocean sport surf surfer swell waves","🏄🏻‍♂️ 🏄🏼‍♂️ 🏄🏽‍♂️ 🏄🏾‍♂️ 🏄🏿‍♂️"],
      ["🏄‍♀️",4,"woman surfing","beach ocean person sport surf surfer swell waves","🏄🏻‍♀️ 🏄🏼‍♀️ 🏄🏽‍♀️ 🏄🏾‍♀️ 🏄🏿‍♀️"],
      ["🚣",1,"person rowing boat","canoe cruise fishing lake oar paddle raft river row rowboat","🚣🏻 🚣🏼 🚣🏽 🚣🏾 🚣🏿"],
      ["🚣‍♂️",4,"man rowing boat","canoe cruise fishing lake oar paddle raft river row rowboat","🚣🏻‍♂️ 🚣🏼‍♂️ 🚣🏽‍♂️ 🚣🏾‍♂️ 🚣🏿‍♂️"],
      ["🚣‍♀️",4,"woman rowing boat","canoe cruise fishing lake oar paddle raft river row rowboat","🚣🏻‍♀️ 🚣🏼‍♀️ 🚣🏽‍♀️ 🚣🏾‍♀️ 🚣🏿‍♀️"],
      ["🏊",0.6,"person swimming","freestyle sport swim swimmer triathlon","🏊🏻 🏊🏼 🏊🏽 🏊🏾 🏊🏿"],
      ["🏊‍♂️",4,"man swimming","freestyle sport swim swimmer triathlon","🏊🏻‍♂️ 🏊🏼‍♂️ 🏊🏽‍♂️ 🏊🏾‍♂️ 🏊🏿‍♂️"],
      ["🏊‍♀️",4,"woman swimming","freestyle man sport swim swimmer triathlon","🏊🏻‍♀️ 🏊🏼‍♀️ 🏊🏽‍♀️ 🏊🏾‍♀️ 🏊🏿‍♀️"],
      ["⛹️",0.7,"person bouncing ball","athletic basketball championship dribble net player throw","⛹🏻 ⛹🏼 ⛹🏽 ⛹🏾 ⛹🏿"],
      ["⛹️‍♂️",4,"man bouncing ball","athletic basketball championship dribble net player throw","⛹🏻‍♂️ ⛹🏼‍♂️ ⛹🏽‍♂️ ⛹🏾‍♂️ ⛹🏿‍♂️"],
      ["⛹️‍♀️",4,"woman bouncing ball","athletic basketball championship dribble net player throw","⛹🏻‍♀️ ⛹🏼‍♀️ ⛹🏽‍♀️ ⛹🏾‍♀️ ⛹🏿‍♀️"],
      ["🏋️",0.7,"person lifting weights","barbell bodybuilder deadlift lifter powerlifting weight weightlifter workout","🏋🏻 🏋🏼 🏋🏽 🏋🏾 🏋🏿"],
      ["🏋️‍♂️",4,"man lifting weights","barbell bodybuilder deadlift lifter powerlifting weight weightlifter workout","🏋🏻‍♂️ 🏋🏼‍♂️ 🏋🏽‍♂️ 🏋🏾‍♂️ 🏋🏿‍♂️"],
      ["🏋️‍♀️",4,"woman lifting weights","barbell bodybuilder deadlift lifter powerlifting weight weightlifter workout","🏋🏻‍♀️ 🏋🏼‍♀️ 🏋🏽‍♀️ 🏋🏾‍♀️ 🏋🏿‍♀️"],
      ["🚴",1,"person biking","bicycle bicyclist bike cycle cyclist riding sport","🚴🏻 🚴🏼 🚴🏽 🚴🏾 🚴🏿"],
      ["🚴‍♂️",4,"man biking","bicycle bicyclist bike cycle cyclist riding sport","🚴🏻‍♂️ 🚴🏼‍♂️ 🚴🏽‍♂️ 🚴🏾‍♂️ 🚴🏿‍♂️"],
      ["🚴‍♀️",4,"woman biking","bicycle bicyclist bike cycle cyclist riding sport","🚴🏻‍♀️ 🚴🏼‍♀️ 🚴🏽‍♀️ 🚴🏾‍♀️ 🚴🏿‍♀️"],
      ["🚵",1,"person mountain biking","bicycle bicyclist bike cycle cyclist riding sport","🚵🏻 🚵🏼 🚵🏽 🚵🏾 🚵🏿"],
      ["🚵‍♂️",4,"man mountain biking","bicycle bicyclist bike cycle cyclist riding sport","🚵🏻‍♂️ 🚵🏼‍♂️ 🚵🏽‍♂️ 🚵🏾‍♂️ 🚵🏿‍♂️"],
      ["🚵‍♀️",4,"woman mountain biking","bicycle bicyclist bike cycle cyclist riding sport","🚵🏻‍♀️ 🚵🏼‍♀️ 🚵🏽‍♀️ 🚵🏾‍♀️ 🚵🏿‍♀️"],
      ["🤸",3,"person cartwheeling","active cartwheel excited flip gymnastics happy somersault","🤸🏻 🤸🏼 🤸🏽 🤸🏾 🤸🏿"],
      ["🤸‍♂️",4,"man cartwheeling","active cartwheel excited flip gymnastics happy somersault","🤸🏻‍♂️ 🤸🏼‍♂️ 🤸🏽‍♂️ 🤸🏾‍♂️ 🤸🏿‍♂️"],
      ["🤸‍♀️",4,"woman cartwheeling","active cartwheel excited flip gymnastics happy somersault","🤸🏻‍♀️ 🤸🏼‍♀️ 🤸🏽‍♀️ 🤸🏾‍♀️ 🤸🏿‍♀️"],
      ["🤼",3,"people wrestling","combat duel grapple ring tournament wrestle","🤼🏻 🤼🏼 🤼🏽 🤼🏾 🤼🏿"],
      ["🤼‍♂️",4,"men wrestling","combat duel grapple ring tournament wrestle","🤼🏻‍♂️ 🤼🏼‍♂️ 🤼🏽‍♂️ 🤼🏾‍♂️ 🤼🏿‍♂️"],
      ["🤼‍♀️",4,"women wrestling","combat duel grapple ring tournament wrestle","🤼🏻‍♀️ 🤼🏼‍♀️ 🤼🏽‍♀️ 🤼🏾‍♀️ 🤼🏿‍♀️"],
      ["🤽",3,"person playing water polo","sport swimming waterpolo","🤽🏻 🤽🏼 🤽🏽 🤽🏾 🤽🏿"],
      ["🤽‍♂️",4,"man playing water polo","sport swimming waterpolo","🤽🏻‍♂️ 🤽🏼‍♂️ 🤽🏽‍♂️ 🤽🏾‍♂️ 🤽🏿‍♂️"],
      ["🤽‍♀️",4,"woman playing water polo","sport swimming waterpolo","🤽🏻‍♀️ 🤽🏼‍♀️ 🤽🏽‍♀️ 🤽🏾‍♀️ 🤽🏿‍♀️"],
      ["🤾",3,"person playing handball","athletics ball catch chuck hurl lob pitch sport throw toss","🤾🏻 🤾🏼 🤾🏽 🤾🏾 🤾🏿"],
      ["🤾‍♂️",4,"man playing handball","athletics ball catch chuck hurl lob pitch sport throw toss","🤾🏻‍♂️ 🤾🏼‍♂️ 🤾🏽‍♂️ 🤾🏾‍♂️ 🤾🏿‍♂️"],
      ["🤾‍♀️",4,"woman playing handball","athletics ball catch chuck hurl lob pitch sport throw toss","🤾🏻‍♀️ 🤾🏼‍♀️ 🤾🏽‍♀️ 🤾🏾‍♀️ 🤾🏿‍♀️"],
      ["🤹",3,"person juggling","act balance balancing handle juggle manage multitask skill","🤹🏻 🤹🏼 🤹🏽 🤹🏾 🤹🏿"],
      ["🤹‍♂️",4,"man juggling","act balance balancing handle juggle manage multitask skill","🤹🏻‍♂️ 🤹🏼‍♂️ 🤹🏽‍♂️ 🤹🏾‍♂️ 🤹🏿‍♂️"],
      ["🤹‍♀️",4,"woman juggling","act balance balancing handle juggle manage multitask skill","🤹🏻‍♀️ 🤹🏼‍♀️ 🤹🏽‍♀️ 🤹🏾‍♀️ 🤹🏿‍♀️"],
      ["🧘",5,"person in lotus position","cross legged legs meditation peace relax serenity yoga yogi zen","🧘🏻 🧘🏼 🧘🏽 🧘🏾 🧘🏿"],
      ["🧘‍♂️",5,"man in lotus position","cross legged legs meditation peace relax serenity yoga yogi zen","🧘🏻‍♂️ 🧘🏼‍♂️ 🧘🏽‍♂️ 🧘🏾‍♂️ 🧘🏿‍♂️"],
      ["🧘‍♀️",5,"woman in lotus position","cross legged legs meditation peace relax serenity yoga yogi zen","🧘🏻‍♀️ 🧘🏼‍♀️ 🧘🏽‍♀️ 🧘🏾‍♀️ 🧘🏿‍♀️"],
      ["🛀",0.6,"person taking bath","bathtub tub","🛀🏻 🛀🏼 🛀🏽 🛀🏾 🛀🏿"],
      ["🛌",1,"person in bed","bedtime good goodnight hotel nap night sleep tired zzz sleeping","🛌🏻 🛌🏼 🛌🏽 🛌🏾 🛌🏿"],
      ["🧑‍🤝‍🧑",12,"people holding hands","bae bestie bff couple dating flirt friends hand hold twins","🧑🏻‍🤝‍🧑🏻 🧑🏼‍🤝‍🧑🏼 🧑🏽‍🤝‍🧑🏽 🧑🏾‍🤝‍🧑🏾 🧑🏿‍🤝‍🧑🏿"],
      ["👭",1,"women holding hands","bae bestie bff couple dating flirt friends girls hand hold sisters twins two","👭🏻 👭🏼 👭🏽 👭🏾 👭🏿"],
      ["👫",0.6,"woman and man holding hands","bae bestie bff couple dating flirt friends hand hold twins","👫🏻 👫🏼 👫🏽 👫🏾 👫🏿"],
      ["👬",1,"men holding hands","bae bestie bff boys brothers couple dating flirt friends hand hold twins two","👬🏻 👬🏼 👬🏽 👬🏾 👬🏿"],
      ["💏",0.6,"kiss","anniversary babe bae couple date dating heart love mwah person romance together xoxo couplekiss","💏🏻 💏🏼 💏🏽 💏🏾 💏🏿"],
      ["👩‍❤️‍💋‍👨",2,"kiss: woman, man","anniversary babe bae couple date dating heart love mwah person romance together xoxo couplekiss","👩🏻‍❤️‍💋‍👨🏻 👩🏼‍❤️‍💋‍👨🏼 👩🏽‍❤️‍💋‍👨🏽 👩🏾‍❤️‍💋‍👨🏾 👩🏿‍❤️‍💋‍👨🏿"],
      ["👨‍❤️‍💋‍👨",2,"kiss: man, man","anniversary babe bae couple date dating heart love mwah person romance together xoxo couplekiss","👨🏻‍❤️‍💋‍👨🏻 👨🏼‍❤️‍💋‍👨🏼 👨🏽‍❤️‍💋‍👨🏽 👨🏾‍❤️‍💋‍👨🏾 👨🏿‍❤️‍💋‍👨🏿"],
      ["👩‍❤️‍💋‍👩",2,"kiss: woman, woman","anniversary babe bae couple date dating heart love mwah person romance together xoxo couplekiss","👩🏻‍❤️‍💋‍👩🏻 👩🏼‍❤️‍💋‍👩🏼 👩🏽‍❤️‍💋‍👩🏽 👩🏾‍❤️‍💋‍👩🏾 👩🏿‍❤️‍💋‍👩🏿"],
      ["💑",0.6,"couple with heart","anniversary babe bae dating kiss love person relationship romance together you","💑🏻 💑🏼 💑🏽 💑🏾 💑🏿"],
      ["👩‍❤️‍👨",2,"couple with heart: woman, man","anniversary babe bae dating kiss love person relationship romance together you","👩🏻‍❤️‍👨🏻 👩🏼‍❤️‍👨🏼 👩🏽‍❤️‍👨🏽 👩🏾‍❤️‍👨🏾 👩🏿‍❤️‍👨🏿"],
      ["👨‍❤️‍👨",2,"couple with heart: man, man","anniversary babe bae dating kiss love person relationship romance together you","👨🏻‍❤️‍👨🏻 👨🏼‍❤️‍👨🏼 👨🏽‍❤️‍👨🏽 👨🏾‍❤️‍👨🏾 👨🏿‍❤️‍👨🏿"],
      ["👩‍❤️‍👩",2,"couple with heart: woman, woman","anniversary babe bae dating kiss love person relationship romance together you","👩🏻‍❤️‍👩🏻 👩🏼‍❤️‍👩🏼 👩🏽‍❤️‍👩🏽 👩🏾‍❤️‍👩🏾 👩🏿‍❤️‍👩🏿"],
      ["👨‍👩‍👦",2,"family: man, woman, boy","child"],
      ["👨‍👩‍👧",2,"family: man, woman, girl","child"],
      ["👨‍👩‍👧‍👦",2,"family: man, woman, girl, boy","child"],
      ["👨‍👩‍👦‍👦",2,"family: man, woman, boy, boy","child"],
      ["👨‍👩‍👧‍👧",2,"family: man, woman, girl, girl","child"],
      ["👨‍👨‍👦",2,"family: man, man, boy","child"],
      ["👨‍👨‍👧",2,"family: man, man, girl","child"],
      ["👨‍👨‍👧‍👦",2,"family: man, man, girl, boy","child"],
      ["👨‍👨‍👦‍👦",2,"family: man, man, boy, boy","child"],
      ["👨‍👨‍👧‍👧",2,"family: man, man, girl, girl","child"],
      ["👩‍👩‍👦",2,"family: woman, woman, boy","child"],
      ["👩‍👩‍👧",2,"family: woman, woman, girl","child"],
      ["👩‍👩‍👧‍👦",2,"family: woman, woman, girl, boy","child"],
      ["👩‍👩‍👦‍👦",2,"family: woman, woman, boy, boy","child"],
      ["👩‍👩‍👧‍👧",2,"family: woman, woman, girl, girl","child"],
      ["👨‍👦",4,"family: man, boy","child"],
      ["👨‍👦‍👦",4,"family: man, boy, boy","child"],
      ["👨‍👧",4,"family: man, girl","child"],
      ["👨‍👧‍👦",4,"family: man, girl, boy","child"],
      ["👨‍👧‍👧",4,"family: man, girl, girl","child"],
      ["👩‍👦",4,"family: woman, boy","child"],
      ["👩‍👦‍👦",4,"family: woman, boy, boy","child"],
      ["👩‍👧",4,"family: woman, girl","child"],
      ["👩‍👧‍👦",4,"family: woman, girl, boy","child"],
      ["👩‍👧‍👧",4,"family: woman, girl, girl","child"],
      ["🗣️",0.7,"speaking head","face silhouette speak"],
      ["👤",0.6,"bust in silhouette","mysterious shadow"],
      ["👥",1,"busts in silhouette","bff bust everyone friend friends people"],
      ["🫂",13,"people hugging","comfort embrace farewell friendship goodbye hello hug love thanks"],
      ["👪",0.6,"family","child"],
      ["🧑‍🧑‍🧒",15.1,"family: adult, adult, child",""],
      ["🧑‍🧑‍🧒‍🧒",15.1,"family: adult, adult, child, child",""],
      ["🧑‍🧒",15.1,"family: adult, child",""],
      ["🧑‍🧒‍🧒",15.1,"family: adult, child, child",""],
      ["👣",0.6,"footprints","barefoot clothing footprint omw print walk"],
      ["🫆",16,"fingerprint","clue crime detective forensics identity mystery print safety trace"],
      "animals & nature",
      ["🐵",0.6,"monkey face","animal banana"],
      ["🐒",0.6,"monkey","animal banana"],
      ["🦍",3,"gorilla","animal"],
      ["🦧",12,"orangutan","animal ape monkey"],
      ["🐶",0.6,"dog face","adorbs animal pet puppies puppy"],
      ["🐕",0.7,"dog","animal animals dogs pet dog2"],
      ["🦮",12,"guide dog","accessibility animal blind"],
      ["🐕‍🦺",12,"service dog","accessibility animal assistance"],
      ["🐩",0.6,"poodle","animal dog fluffy"],
      ["🐺",0.6,"wolf","animal face"],
      ["🦊",3,"fox","animal face"],
      ["🦝",11,"raccoon","animal curious sly"],
      ["🐱",0.6,"cat face","animal kitten kitty pet"],
      ["🐈",0.7,"cat","animal animals cats kitten pet cat2"],
      ["🐈‍⬛",13,"black cat","animal feline halloween meow unlucky"],
      ["🦁",1,"lion","leo alpha animal face mane order rawr roar safari strong zodiac"],
      ["🐯",0.6,"tiger face","animal big cat predator"],
      ["🐅",1,"tiger","animal big cat predator zoo tiger2"],
      ["🐆",1,"leopard","animal big cat predator zoo"],
      ["🐴",0.6,"horse face","animal dressage equine farm horses"],
      ["🫎",15,"moose","alces animal antlers elk mammal"],
      ["🫏",15,"donkey","animal ass burro hinny mammal mule stubborn"],
      ["🐎",0.6,"horse","animal equestrian farm racehorse racing"],
      ["🦄",1,"unicorn","face"],
      ["🦓",5,"zebra","animal stripe"],
      ["🦌",3,"deer","animal"],
      ["🦬",13,"bison","animal buffalo herd wisent"],
      ["🐮",0.6,"cow face","animal farm milk moo"],
      ["🐂",1,"ox","taurus animal animals bull farm zodiac"],
      ["🐃",1,"water buffalo","animal zoo"],
      ["🐄",1,"cow","animal animals farm milk moo cow2"],
      ["🐷",0.6,"pig face","animal bacon farm pork"],
      ["🐖",1,"pig","animal bacon farm pork sow pig2"],
      ["🐗",0.6,"boar","animal pig"],
      ["🐽",0.6,"pig nose","animal face farm smell snout"],
      ["🐏",1,"ram","aries animal horns male sheep zodiac zoo"],
      ["🐑",0.6,"ewe","animal baa farm female fluffy lamb sheep wool"],
      ["🐐",1,"goat","capricorn animal farm milk zodiac"],
      ["🐪",1,"camel","animal desert dromedary hump one"],
      ["🐫",0.6,"two-hump camel","animal bactrian desert hump two"],
      ["🦙",11,"llama","alpaca animal guanaco vicuña wool"],
      ["🦒",5,"giraffe","animal spots"],
      ["🐘",0.6,"elephant","animal"],
      ["🦣",13,"mammoth","animal extinction large tusk wooly"],
      ["🦏",3,"rhinoceros","animal"],
      ["🦛",11,"hippopotamus","animal hippo"],
      ["🐭",0.6,"mouse face","animal"],
      ["🐁",1,"mouse","animal animals mouse2"],
      ["🐀",1,"rat","animal"],
      ["🐹",0.6,"hamster","animal face pet"],
      ["🐰",0.6,"rabbit face","animal bunny pet"],
      ["🐇",1,"rabbit","animal bunny pet rabbit2"],
      ["🐿️",0.7,"chipmunk","animal squirrel"],
      ["🦫",13,"beaver","animal dam teeth"],
      ["🦔",5,"hedgehog","animal spiny"],
      ["🦇",3,"bat","animal vampire"],
      ["🐻",0.6,"bear","animal face grizzly growl honey"],
      ["🐻‍❄️",13,"polar bear","animal arctic white"],
      ["🐨",0.6,"koala","animal australia bear down face marsupial under"],
      ["🐼",0.6,"panda","animal bamboo face"],
      ["🦥",12,"sloth","lazy slow"],
      ["🦦",12,"otter","animal fishing playful"],
      ["🦨",12,"skunk","animal stink"],
      ["🦘",11,"kangaroo","animal joey jump marsupial"],
      ["🦡",11,"badger","animal honey pester"],
      ["🐾",0.6,"paw prints","feet paws print"],
      ["🦃",1,"turkey","bird gobble thanksgiving"],
      ["🐔",0.6,"chicken","animal bird ornithology"],
      ["🐓",1,"rooster","animal bird ornithology"],
      ["🐣",0.6,"hatching chick","animal baby bird egg"],
      ["🐤",0.6,"baby chick","animal bird ornithology"],
      ["🐥",0.6,"front-facing baby chick","animal bird newborn ornithology hatched"],
      ["🐦",0.6,"bird","animal ornithology"],
      ["🐧",0.6,"penguin","animal antarctica bird ornithology"],
      ["🕊️",0.7,"dove","bird fly ornithology peace"],
      ["🦅",3,"eagle","animal bird ornithology"],
      ["🦆",3,"duck","animal bird ornithology"],
      ["🦢",11,"swan","animal bird cygnet duckling ornithology ugly"],
      ["🦉",3,"owl","animal bird ornithology wise"],
      ["🦤",13,"dodo","animal bird extinction large ornithology"],
      ["🪶",13,"feather","bird flight light plumage"],
      ["🦩",12,"flamingo","animal bird flamboyant ornithology tropical"],
      ["🦚",11,"peacock","animal bird colorful ornithology ostentatious peahen pretty proud"],
      ["🦜",11,"parrot","animal bird ornithology pirate talk"],
      ["🪽",15,"wing","angelic ascend aviation bird fly flying heavenly mythology soar"],
      ["🐦‍⬛",15,"black bird","animal beak caw corvid crow ornithology raven rook"],
      ["🪿",15,"goose","animal bird duck flock fowl gaggle gander geese honk ornithology silly"],
      ["🐦‍🔥",15.1,"phoenix","ascend ascension emerge fantasy firebird glory immortal rebirth reincarnation reinvent renewal revival revive rise transform"],
      ["🐸",0.6,"frog","animal face"],
      ["🐊",1,"crocodile","animal zoo"],
      ["🐢",0.6,"turtle","animal terrapin tortoise"],
      ["🦎",3,"lizard","animal reptile"],
      ["🐍",0.6,"snake","ophiuchus animal bearer serpent zodiac"],
      ["🐲",0.6,"dragon face","animal fairy fairytale tale"],
      ["🐉",1,"dragon","animal fairy fairytale knights tale"],
      ["🦕",5,"sauropod","brachiosaurus brontosaurus dinosaur diplodocus"],
      ["🦖",5,"T-Rex","rex t tyrannosaurus dinosaur"],
      ["🐳",0.6,"spouting whale","animal beach face ocean"],
      ["🐋",1,"whale","animal beach ocean whale2"],
      ["🐬",0.6,"dolphin","animal beach flipper ocean"],
      ["🫍",17,"orca","marine ocean whale"],
      ["🦭",13,"seal","animal lion ocean sea"],
      ["🐟",0.6,"fish","pisces animal dinner fishes fishing zodiac"],
      ["🐠",0.6,"tropical fish","animal fishes"],
      ["🐡",0.6,"blowfish","animal fish"],
      ["🦈",3,"shark","animal fish"],
      ["🐙",0.6,"octopus","animal creature ocean"],
      ["🐚",0.6,"spiral shell","animal beach conch sea"],
      ["🪸",14,"coral","change climate ocean reef sea"],
      ["🪼",15,"jellyfish","animal aquarium burn invertebrate jelly life marine ocean ouch plankton sea sting stinger tentacles"],
      ["🦀",1,"crab","cancer zodiac"],
      ["🦞",11,"lobster","animal bisque claws seafood"],
      ["🦐",3,"shrimp","food shellfish small"],
      ["🦑",3,"squid","animal food mollusk"],
      ["🦪",12,"oyster","diving pearl"],
      ["🐌",0.6,"snail","animal escargot garden nature slug"],
      ["🦋",3,"butterfly","insect pretty"],
      ["🫌",18,"monarch butterfly","caterpillar change fragile hope insect metamorphosis migration transformation"],
      ["🐛",0.6,"bug","animal garden insect"],
      ["🐜",0.6,"ant","animal garden insect"],
      ["🐝",0.6,"honeybee","animal bee bumblebee honey insect nature spring"],
      ["🪲",13,"beetle","animal bug insect"],
      ["🐞",0.6,"lady beetle","animal garden insect ladybird ladybug nature"],
      ["🦗",5,"cricket","orthoptera animal bug grasshopper insect"],
      ["🪳",13,"cockroach","animal insect pest roach"],
      ["🕷️",0.7,"spider","animal insect"],
      ["🕸️",0.7,"spider web",""],
      ["🦂",1,"scorpion","scorpio scorpius zodiac"],
      ["🦟",11,"mosquito","bite disease fever insect malaria pest virus"],
      ["🪰",13,"fly","animal disease insect maggot pest rotting"],
      ["🪱",13,"worm","animal annelid earthworm parasite"],
      ["🦠",11,"microbe","amoeba bacteria science virus"],
      ["💐",0.6,"bouquet","anniversary birthday date flower love plant romance"],
      ["🌸",0.6,"cherry blossom","flower plant spring springtime"],
      ["💮",0.6,"white flower",""],
      ["🪷",14,"lotus","buddhism hinduism beauty calm flower peace purity serenity"],
      ["🏵️",0.7,"rosette","plant"],
      ["🌹",0.6,"rose","beauty elegant flower love plant red valentine"],
      ["🥀",3,"wilted flower","dying"],
      ["🌺",0.6,"hibiscus","flower plant"],
      ["🌻",0.6,"sunflower","flower outdoors plant sun"],
      ["🌼",0.6,"blossom","buttercup dandelion flower plant"],
      ["🌷",0.6,"tulip","blossom flower growth plant"],
      ["🪻",15,"hyacinth","bloom bluebonnet flower indigo lavender lilac lupine plant purple shrub snapdragon spring violet"],
      ["🌱",0.6,"seedling","plant sapling sprout young"],
      ["🪴",13,"potted plant","decor grow house nurturing pot"],
      ["🌲",1,"evergreen tree","christmas forest pine"],
      ["🌳",1,"deciduous tree","forest green habitat shedding"],
      ["🌴",0.6,"palm tree","beach plant tropical"],
      ["🌵",0.6,"cactus","desert drought nature plant"],
      ["🌾",0.6,"sheaf of rice","ear grain grains plant"],
      ["🌿",0.6,"herb","leaf plant"],
      ["☘️",1,"shamrock","irish plant"],
      ["🍀",0.6,"four leaf clover","4 four-leaf irish lucky plant"],
      ["🍁",0.6,"maple leaf","falling"],
      ["🍂",0.6,"fallen leaf","autumn fall falling"],
      ["🍃",0.6,"leaf fluttering in wind","blow flutter leaves"],
      ["🪹",14,"empty nest","branch home nesting"],
      ["🪺",14,"nest with eggs","bird branch egg nesting"],
      ["🍄",0.6,"mushroom","fungus toadstool"],
      ["🪾",16,"leafless tree","bare barren branches dead drought trunk winter wood"],
      "food & drink",
      ["🍇",0.6,"grapes","dionysus fruit grape"],
      ["🍈",0.6,"melon","cantaloupe fruit"],
      ["🍉",0.6,"watermelon","fruit"],
      ["🍊",0.6,"tangerine","c citrus fruit nectarine orange vitamin mandarin"],
      ["🍋",1,"lemon","citrus fruit sour"],
      ["🍋‍🟩",15.1,"lime","acidity citrus cocktail fruit garnish key margarita mojito refreshing salsa sour tangy tequila tropical zest"],
      ["🍌",0.6,"banana","fruit potassium"],
      ["🍍",0.6,"pineapple","colada fruit pina tropical"],
      ["🥭",11,"mango","food fruit tropical"],
      ["🍎",0.6,"red apple","diet food fruit health ripe"],
      ["🍏",0.6,"green apple","fruit"],
      ["🍐",1,"pear","fruit"],
      ["🍑",0.6,"peach","fruit"],
      ["🍒",0.6,"cherries","berries cherry fruit red"],
      ["🍓",0.6,"strawberry","berry fruit"],
      ["🫐",13,"blueberries","berries berry bilberry blue blueberry food fruit"],
      ["🥝",3,"kiwi fruit","food"],
      ["🍅",0.6,"tomato","food fruit vegetable"],
      ["🫒",13,"olive","food"],
      ["🥥",5,"coconut","colada palm piña"],
      ["🥑",3,"avocado","food fruit"],
      ["🍆",0.6,"eggplant","aubergine vegetable"],
      ["🥔",3,"potato","food vegetable"],
      ["🥕",3,"carrot","food vegetable"],
      ["🌽",0.6,"ear of corn","crops farm maize maze"],
      ["🌶️",0.7,"hot pepper",""],
      ["🫑",13,"bell pepper","capsicum food vegetable"],
      ["🥒",3,"cucumber","food pickle vegetable"],
      ["🫝",18,"pickle","brine condiment cucumber ferment gherkin relish trouble"],
      ["🥬",11,"leafy green","bok burgers cabbage choy kale lettuce salad"],
      ["🥦",5,"broccoli","cabbage wild"],
      ["🧄",12,"garlic","flavoring"],
      ["🧅",12,"onion","flavoring"],
      ["🥜",3,"peanuts","food nut peanut vegetable"],
      ["🫘",14,"beans","food kidney legume small"],
      ["🌰",0.6,"chestnut","almond plant"],
      ["🫚",15,"ginger root","beer health herb natural spice"],
      ["🫛",15,"pea pod","beans beanstalk edamame legume soybean vegetable veggie"],
      ["🍄‍🟫",15.1,"brown mushroom","food fungi fungus nature pizza portobello shiitake shroom spore sprout toppings truffle vegetable vegetarian veggie"],
      ["🫜",16,"root vegetable","beet food garden radish salad turnip vegetarian"],
      ["🍞",0.6,"bread","carbs food grain loaf restaurant toast wheat"],
      ["🥐",3,"croissant","bread breakfast crescent food french roll"],
      ["🥖",3,"baguette bread","food french"],
      ["🫓",13,"flatbread","arepa bread food gordita lavash naan pita"],
      ["🥨",5,"pretzel","convoluted twisted"],
      ["🥯",11,"bagel","bakery bread breakfast schmear"],
      ["🥞",3,"pancakes","breakfast crêpe food hotcake pancake"],
      ["🧇",12,"waffle","breakfast indecisive iron"],
      ["🧀",1,"cheese wedge",""],
      ["🍖",0.6,"meat on bone",""],
      ["🍗",0.6,"poultry leg","bone chicken drumstick hungry turkey"],
      ["🥩",5,"cut of meat","chop lambchop porkchop red steak"],
      ["🥓",3,"bacon","breakfast food meat"],
      ["🍔",0.6,"hamburger","burger eat fast food hungry"],
      ["🍟",0.6,"french fries","fast food"],
      ["🍕",0.6,"pizza","cheese food hungry pepperoni slice"],
      ["🌭",1,"hot dog","frankfurter hotdog sausage"],
      ["🥪",5,"sandwich","bread"],
      ["🌮",1,"taco","mexican"],
      ["🌯",1,"burrito","mexican wrap"],
      ["🫔",13,"tamale","food mexican pamonha wrapped"],
      ["🥙",3,"stuffed flatbread","falafel food gyro kebab"],
      ["🧆",12,"falafel","chickpea meatball"],
      ["🥚",3,"egg","breakfast food"],
      ["🍳",0.6,"cooking","breakfast easy egg fry frying over pan restaurant side sunny up fried"],
      ["🥘",3,"shallow pan of food","casserole paella"],
      ["🍲",0.6,"pot of food","soup stew"],
      ["🫕",13,"fondue","cheese chocolate food melted pot ski"],
      ["🥣",5,"bowl with spoon","breakfast cereal congee oatmeal porridge"],
      ["🥗",3,"green salad","food"],
      ["🍿",1,"popcorn","corn movie pop"],
      ["🧈",12,"butter","dairy"],
      ["🧂",11,"salt","condiment flavor mad salty shaker taste upset"],
      ["🥫",5,"canned food","can"],
      ["🍱",0.6,"bento box","food"],
      ["🍘",0.6,"rice cracker","food"],
      ["🍙",0.6,"rice ball","japanese food"],
      ["🍚",0.6,"cooked rice","food"],
      ["🍛",0.6,"curry rice","food"],
      ["🍜",0.6,"steaming bowl","chopsticks food noodle pho ramen soup"],
      ["🍝",0.6,"spaghetti","food meatballs pasta restaurant"],
      ["🍠",0.6,"roasted sweet potato","food"],
      ["🍢",0.6,"oden","food kebab restaurant seafood skewer stick"],
      ["🍣",0.6,"sushi","food"],
      ["🍤",0.6,"fried shrimp","prawn tempura"],
      ["🍥",0.6,"fish cake with swirl","food pastry restaurant"],
      ["🥮",11,"moon cake","autumn festival yuèbǐng"],
      ["🍡",0.6,"dango","japanese dessert skewer stick sweet"],
      ["🥟",5,"dumpling","empanada gyōza jiaozi pierogi potsticker"],
      ["🥠",5,"fortune cookie","prophecy"],
      ["🥡",5,"takeout box","chopsticks delivery food oyster pail"],
      ["🍦",0.6,"soft ice cream","dessert food icecream restaurant serve sweet"],
      ["🍧",0.6,"shaved ice","dessert restaurant sweet"],
      ["🍨",0.6,"ice cream","dessert food restaurant sweet"],
      ["🍩",0.6,"doughnut","breakfast dessert donut food sweet"],
      ["🍪",0.6,"cookie","chip chocolate dessert sweet"],
      ["🎂",0.6,"birthday cake","bday celebration dessert happy pastry sweet"],
      ["🍰",0.6,"shortcake","cake dessert pastry slice sweet"],
      ["🧁",11,"cupcake","bakery dessert sprinkles sugar sweet treat"],
      ["🥧",5,"pie","apple filling fruit meat pastry pumpkin slice"],
      ["🍫",0.6,"chocolate bar","candy dessert halloween sweet tooth"],
      ["🍬",0.6,"candy","cavities dessert halloween restaurant sweet tooth wrapper"],
      ["🍭",0.6,"lollipop","candy dessert food restaurant sweet"],
      ["🍮",0.6,"custard","dessert pudding sweet"],
      ["🍯",0.6,"honey pot","barrel bear food honeypot jar sweet"],
      ["🍼",1,"baby bottle","babies birth born drink infant milk newborn"],
      ["🥛",3,"glass of milk","drink"],
      ["☕",0.6,"hot beverage","cafe caffeine chai coffee drink morning steaming tea"],
      ["🫖",13,"teapot","brew drink food pot tea"],
      ["🍵",0.6,"teacup without handle","beverage cup drink oolong tea"],
      ["🍶",0.6,"sake","bar beverage bottle cup drink restaurant"],
      ["🍾",1,"bottle with popping cork","bar drink champagne"],
      ["🍷",0.6,"wine glass","alcohol bar beverage booze club drink drinking drinks restaurant"],
      ["🍸",0.6,"cocktail glass","alcohol bar booze club drink drinking drinks mad martini men"],
      ["🍹",0.6,"tropical drink","alcohol bar booze club cocktail drinking drinks drunk mai party tai tropics"],
      ["🍺",0.6,"beer mug","alcohol ale bar booze drink drinking drinks octoberfest oktoberfest pint stein summer"],
      ["🍻",0.6,"clinking beer mugs","alcohol bar booze bottoms cheers clink drinking drinks beers"],
      ["🥂",3,"clinking glasses","celebrate clink drink glass"],
      ["🥃",3,"tumbler glass","liquor scotch shot whiskey whisky"],
      ["🫗",14,"pouring liquid","accident drink empty glass oops pour spill water"],
      ["🥤",5,"cup with straw","drink juice malt soda soft water"],
      ["🧋",13,"bubble tea","boba food milk pearl"],
      ["🧃",12,"beverage box","juice straw sweet"],
      ["🧉",12,"mate","drink"],
      ["🧊",12,"ice","cold cube iceberg"],
      ["🥢",5,"chopsticks","hashi jeotgarak kuaizi"],
      ["🍽️",0.7,"fork and knife with plate","cooking dinner eat cutlery"],
      ["🍴",0.6,"fork and knife","breakfast breaky cooking cutlery delicious dinner eat feed food hungry lunch restaurant yum yummy"],
      ["🥄",3,"spoon","eat tableware"],
      ["🔪",0.6,"kitchen knife","chef cooking hocho tool weapon"],
      ["🫙",14,"jar","condiment container empty nothing sauce store"],
      ["🏺",1,"amphora","aquarius cooking drink jug tool weapon zodiac"],
      "travel & places",
      ["🌍",0.7,"globe showing Europe-Africa","africa europe earth world"],
      ["🌎",0.7,"globe showing Americas","earth world"],
      ["🌏",0.6,"globe showing Asia-Australia","asia australia earth world"],
      ["🌐",1,"globe with meridians","earth internet web world worldwide"],
      ["🗺️",0.7,"world map",""],
      ["🗾",0.6,"map of Japan",""],
      ["🧭",11,"compass","direction magnetic navigation orienteering"],
      ["🏔️",0.7,"snow-capped mountain","cold snow"],
      ["⛰️",0.7,"mountain",""],
      ["🛘",17,"landslide","avalanche danger disaster earthquake mountain mudslide rocks"],
      ["🌋",0.6,"volcano","eruption mountain nature"],
      ["🗻",0.6,"mount fuji","mountain nature"],
      ["🏕️",0.7,"camping",""],
      ["🏖️",0.7,"beach with umbrella",""],
      ["🏜️",0.7,"desert",""],
      ["🏝️",0.7,"desert island",""],
      ["🏞️",0.7,"national park",""],
      ["🏟️",0.7,"stadium",""],
      ["🏛️",0.7,"classical building",""],
      ["🏗️",0.7,"building construction","crane"],
      ["🧱",11,"brick","bricks clay mortar wall"],
      ["🪨",13,"rock","boulder heavy solid stone tough"],
      ["🪵",13,"wood","log lumber timber"],
      ["🛖",13,"hut","home house roundhouse shelter yurt"],
      ["🏘️",0.7,"houses","house"],
      ["🏚️",0.7,"derelict house","home"],
      ["🏠",0.6,"house","building country heart home ranch settle simple suburban suburbia where"],
      ["🏡",0.6,"house with garden","building country heart home ranch settle simple suburban suburbia where"],
      ["🏢",0.6,"office building","city cubical job"],
      ["🏣",0.6,"Japanese post office","building"],
      ["🏤",1,"post office","european building"],
      ["🏥",0.6,"hospital","building doctor medicine"],
      ["🏦",0.6,"bank","building"],
      ["🏨",0.6,"hotel","building"],
      ["🏩",0.6,"love hotel","building"],
      ["🏪",0.6,"convenience store","24 building hours"],
      ["🏫",0.6,"school","building"],
      ["🏬",0.6,"department store","building"],
      ["🏭",0.6,"factory","building"],
      ["🏯",0.6,"Japanese castle","building"],
      ["🏰",0.6,"castle","european building"],
      ["💒",0.6,"wedding","chapel hitched nuptials romance"],
      ["🗼",0.6,"Tokyo tower",""],
      ["🗽",0.6,"Statue of Liberty","new ny nyc york"],
      ["⛪",0.6,"church","christian bless chapel cross religion"],
      ["🕌",1,"mosque","muslim islam masjid religion"],
      ["🛕",12,"hindu temple",""],
      ["🕍",1,"synagogue","jew jewish judaism religion temple"],
      ["⛩️",0.7,"shinto shrine","religion"],
      ["🕋",1,"kaaba","muslim hajj islam religion umrah"],
      ["⛲",0.6,"fountain",""],
      ["⛺",0.6,"tent","camping"],
      ["🌁",0.6,"foggy","fog"],
      ["🌃",0.6,"night with stars","star"],
      ["🏙️",0.7,"cityscape","city"],
      ["🌄",0.6,"sunrise over mountains","morning sun"],
      ["🌅",0.6,"sunrise","morning nature sun"],
      ["🌆",0.6,"cityscape at dusk","building city evening landscape sun sunset"],
      ["🌇",0.6,"sunset","building dusk sun city sunrise"],
      ["🌉",0.6,"bridge at night",""],
      ["♨️",0.6,"hot springs","hotsprings steaming"],
      ["🎠",0.6,"carousel horse","entertainment"],
      ["🛝",14,"playground slide","amusement park play playing sliding theme"],
      ["🎡",0.6,"ferris wheel","amusement park theme"],
      ["🎢",0.6,"roller coaster","amusement park theme"],
      ["💈",0.6,"barber pole","cut fresh haircut shave"],
      ["🎪",0.6,"circus tent",""],
      ["🚂",1,"locomotive","caboose engine railway steam train trains travel"],
      ["🚃",0.6,"railway car","electric train tram travel trolleybus"],
      ["🚄",0.6,"high-speed train","railway shinkansen speed bullettrain side"],
      ["🚅",0.6,"bullet train","high-speed nose railway shinkansen speed travel bullettrain front"],
      ["🚆",1,"train","arrived choo railway train2"],
      ["🚇",0.6,"metro","subway travel"],
      ["🚈",1,"light rail","arrived monorail railway"],
      ["🚉",0.6,"station","railway train"],
      ["🚊",1,"tram","trolleybus"],
      ["🚝",1,"monorail","vehicle"],
      ["🚞",1,"mountain railway","car trip"],
      ["🚋",1,"tram car","bus trolley trolleybus train"],
      ["🚌",0.6,"bus","school vehicle"],
      ["🚍",0.7,"oncoming bus","cars"],
      ["🚎",1,"trolleybus","bus tram trolley"],
      ["🚐",1,"minibus","bus drive van vehicle"],
      ["🚑",0.6,"ambulance","emergency vehicle"],
      ["🚒",0.6,"fire engine","truck"],
      ["🚓",0.6,"police car","5–0 cops patrol"],
      ["🚔",0.7,"oncoming police car",""],
      ["🚕",0.6,"taxi","cab cabbie car drive vehicle yellow"],
      ["🚖",1,"oncoming taxi","cab cabbie cars drove hail yellow"],
      ["🚗",0.6,"automobile","car driving vehicle red"],
      ["🚘",0.7,"oncoming automobile","car cars drove vehicle"],
      ["🚙",0.6,"sport utility vehicle","car drive recreational sportutility blue"],
      ["🛻",13,"pickup truck","automobile car flatbed pick-up transportation"],
      ["🚚",0.6,"delivery truck","car drive vehicle"],
      ["🚛",1,"articulated lorry","car drive move semi truck vehicle"],
      ["🚜",1,"tractor","vehicle"],
      ["🏎️",0.7,"racing car","zoom"],
      ["🏍️",0.7,"motorcycle","racing"],
      ["🛵",3,"motor scooter",""],
      ["🦽",12,"manual wheelchair","accessibility"],
      ["🦼",12,"motorized wheelchair","accessibility"],
      ["🛺",12,"auto rickshaw","tuk"],
      ["🚲",0.6,"bicycle","bike class cycle cycling cyclist gang ride spin spinning"],
      ["🛴",3,"kick scooter",""],
      ["🛹",11,"skateboard","board skate skater wheels"],
      ["🛼",13,"roller skate","blades skates sport"],
      ["🚏",0.6,"bus stop","busstop"],
      ["🛣️",0.7,"motorway","highway road"],
      ["🛤️",0.7,"railway track","train"],
      ["🛢️",0.7,"oil drum",""],
      ["⛽",0.6,"fuel pump","diesel fuelpump gas gasoline station"],
      ["🛞",14,"wheel","car circle tire turn vehicle"],
      ["🚨",0.6,"police car light","alarm alert beacon emergency revolving siren rotating"],
      ["🚥",0.6,"horizontal traffic light","intersection signal stop stoplight"],
      ["🚦",1,"vertical traffic light","drove intersection signal stop stoplight"],
      ["🛑",3,"stop sign","octagonal"],
      ["🚧",0.6,"construction","barrier"],
      ["🛙",18,"lighthouse","beacon enlightenment guidance hope light maritime navigation sea signal"],
      ["⚓",0.6,"anchor","ship tool"],
      ["🛟",14,"ring buoy","float life lifesaver preserver rescue safety save saver swim"],
      ["⛵",0.6,"sailboat","boat resort sailing sea yacht"],
      ["🛶",3,"canoe","boat"],
      ["🚤",0.6,"speedboat","billionaire boat lake luxury millionaire summer travel"],
      ["🛳️",0.7,"passenger ship",""],
      ["⛴️",0.7,"ferry","boat passenger"],
      ["🛥️",0.7,"motor boat","motorboat"],
      ["🚢",0.6,"ship","boat passenger travel"],
      ["✈️",0.6,"airplane","aeroplane fly flying jet plane travel"],
      ["🛩️",0.7,"small airplane","aeroplane plane"],
      ["🛫",1,"airplane departure","aeroplane check-in departures plane flight"],
      ["🛬",1,"airplane arrival","aeroplane arrivals arriving landing plane flight"],
      ["🪂",12,"parachute","hang-glide parasail skydive"],
      ["💺",0.6,"seat","chair"],
      ["🚁",1,"helicopter","copter roflcopter travel vehicle"],
      ["🚟",1,"suspension railway",""],
      ["🚠",1,"mountain cableway","cable gondola lift ski"],
      ["🚡",1,"aerial tramway","cable car gondola ropeway"],
      ["🛰️",0.7,"satellite","space artificial"],
      ["🚀",0.6,"rocket","launch rockets space travel"],
      ["🛸",5,"flying saucer","ufo aliens extra terrestrial"],
      ["🛎️",0.7,"bellhop bell","hotel"],
      ["🧳",11,"luggage","bag packing roller suitcase travel"],
      ["⌛",0.6,"hourglass done","sand time timer"],
      ["⏳",0.6,"hourglass not done","flowing hours sand timer waiting yolo"],
      ["⌚",0.6,"watch","clock time"],
      ["⏰",0.6,"alarm clock","hours hrs late time waiting"],
      ["⏱️",1,"stopwatch","clock time"],
      ["⏲️",1,"timer clock",""],
      ["🕰️",0.7,"mantelpiece clock","time"],
      ["🕛",0.6,"twelve o’clock","12 00 clock time clock12"],
      ["🕧",0.7,"twelve-thirty","12 30 clock thirty time twelve clock1230"],
      ["🕐",0.6,"one o’clock","1 00 clock time clock1"],
      ["🕜",0.7,"one-thirty","1 30 clock one thirty time clock130"],
      ["🕑",0.6,"two o’clock","2 00 clock time clock2"],
      ["🕝",0.7,"two-thirty","2 30 clock thirty time two clock230"],
      ["🕒",0.6,"three o’clock","3 00 clock time clock3"],
      ["🕞",0.7,"three-thirty","3 30 clock thirty three time clock330"],
      ["🕓",0.6,"four o’clock","4 00 clock time clock4"],
      ["🕟",0.7,"four-thirty","30 4 clock four thirty time clock430"],
      ["🕔",0.6,"five o’clock","5 00 clock time clock5"],
      ["🕠",0.7,"five-thirty","30 5 clock five thirty time clock530"],
      ["🕕",0.6,"six o’clock","6 00 clock time clock6"],
      ["🕡",0.7,"six-thirty","30 6 clock six thirty clock630"],
      ["🕖",0.6,"seven o’clock","0 7 00 clock clock7"],
      ["🕢",0.7,"seven-thirty","30 7 clock seven thirty clock730"],
      ["🕗",0.6,"eight o’clock","8 00 clock time clock8"],
      ["🕣",0.7,"eight-thirty","30 8 clock eight thirty time clock830"],
      ["🕘",0.6,"nine o’clock","9 00 clock time clock9"],
      ["🕤",0.7,"nine-thirty","30 9 clock nine thirty time clock930"],
      ["🕙",0.6,"ten o’clock","0 10 00 clock clock10"],
      ["🕥",0.7,"ten-thirty","10 30 clock ten thirty time clock1030"],
      ["🕚",0.6,"eleven o’clock","11 00 clock time clock11"],
      ["🕦",0.7,"eleven-thirty","11 30 clock eleven thirty time clock1130"],
      ["🌑",0.6,"new moon","dark space"],
      ["🌒",1,"waxing crescent moon","dreams space"],
      ["🌓",0.6,"first quarter moon","space"],
      ["🌔",0.6,"waxing gibbous moon","space"],
      ["🌕",0.6,"full moon","space"],
      ["🌖",1,"waning gibbous moon","space"],
      ["🌗",1,"last quarter moon","space"],
      ["🌘",1,"waning crescent moon","space"],
      ["🌙",0.6,"crescent moon","ramadan space"],
      ["🌚",1,"new moon face","space with"],
      ["🌛",0.6,"first quarter moon face","space with"],
      ["🌜",0.7,"last quarter moon face","dreams with"],
      ["🌡️",0.7,"thermometer","weather"],
      ["☀️",0.6,"sun","bright rays space sunny weather"],
      ["🌝",1,"full moon face","bright with"],
      ["🌞",1,"sun with face","beach bright day heat shine sunny sunshine weather"],
      ["🪐",12,"ringed planet","saturn saturnine"],
      ["⭐",0.6,"star","astronomy medium stars white"],
      ["🌟",0.6,"glowing star","glittery glow night shining sparkle win star2"],
      ["🌠",0.6,"shooting star","falling night space stars"],
      ["🌌",0.6,"milky way","space"],
      ["☁️",0.6,"cloud","weather"],
      ["⛅",0.6,"sun behind cloud","cloudy weather partly sunny"],
      ["⛈️",0.7,"cloud with lightning and rain","thunder thunderstorm"],
      ["🌤️",0.7,"sun behind small cloud","weather"],
      ["🌥️",0.7,"sun behind large cloud","weather"],
      ["🌦️",0.7,"sun behind rain cloud","weather"],
      ["🌧️",0.7,"cloud with rain","weather"],
      ["🌨️",0.7,"cloud with snow","cold weather"],
      ["🌩️",0.7,"cloud with lightning","weather"],
      ["🌪️",0.7,"tornado","cloud weather whirlwind"],
      ["🌫️",0.7,"fog","cloud weather"],
      ["🌬️",0.7,"wind face","blow cloud"],
      ["🌀",0.6,"cyclone","dizzy hurricane twister typhoon weather"],
      ["🌈",0.6,"rainbow","gay genderqueer glbt glbtq lesbian lgbt lgbtq lgbtqia nature pride queer rain trans transgender weather"],
      ["🌂",0.6,"closed umbrella","clothing rain"],
      ["☂️",0.7,"umbrella","clothing rain open"],
      ["☔",0.6,"umbrella with rain drops","clothing drop weather"],
      ["⛱️",0.7,"umbrella on ground","rain sun parasol"],
      ["⚡",0.6,"high voltage","danger electric electricity lightning nature thunder thunderbolt zap"],
      ["❄️",0.6,"snowflake","cold snow weather"],
      ["☃️",0.7,"snowman","cold man snow with"],
      ["⛄",0.6,"snowman without snow","cold man"],
      ["☄️",1,"comet","space"],
      ["🪋",18,"meteor","apocalypse falling fireball gravity rock space star"],
      ["🔥",0.6,"fire","af burn flame hot lit litaf tool"],
      ["💧",0.6,"droplet","cold comic drop nature sad sweat tear water weather"],
      ["🌊",0.6,"water wave","nature ocean surf surfer surfing"],
      "activities",
      ["🎃",0.6,"jack-o-lantern","celebration halloween jack lantern pumpkin o"],
      ["🎄",0.6,"Christmas tree","celebration"],
      ["🎆",0.6,"fireworks","boom celebration entertainment yolo"],
      ["🎇",0.6,"sparkler","boom celebration fireworks sparkle"],
      ["🧨",11,"firecracker","dynamite explosive fire fireworks light pop popping spark"],
      ["✨",0.6,"sparkles","* magic sparkle star"],
      ["🎈",0.6,"balloon","birthday celebrate celebration"],
      ["🎉",0.6,"party popper","awesome birthday celebrate celebration excited hooray tada woohoo"],
      ["🎊",0.6,"confetti ball","celebrate celebration party woohoo"],
      ["🎋",0.6,"tanabata tree","japanese banner celebration"],
      ["🎍",0.6,"pine decoration","japanese bamboo celebration plant"],
      ["🎎",0.6,"Japanese dolls","celebration doll festival"],
      ["🎏",0.6,"carp streamer","celebration flags"],
      ["🎐",0.6,"wind chime","bell celebration"],
      ["🎑",0.6,"moon viewing ceremony","celebration rice scene"],
      ["🧧",11,"red envelope","gift good hóngbāo lai luck money see"],
      ["🎀",0.6,"ribbon","celebration"],
      ["🎁",0.6,"wrapped gift","birthday bow box celebration christmas present surprise"],
      ["🎗️",0.7,"reminder ribbon","celebration"],
      ["🎟️",0.7,"admission tickets","ticket"],
      ["🎫",0.6,"ticket","admission stub"],
      ["🎖️",0.7,"military medal","award celebration"],
      ["🏆",0.6,"trophy","champion champs prize slay sport victory win winning"],
      ["🏅",1,"sports medal","award gold winner"],
      ["🥇",3,"1st place medal","first gold"],
      ["🥈",3,"2nd place medal","second silver"],
      ["🥉",3,"3rd place medal","bronze third"],
      ["⚽",0.6,"soccer ball","football futbol sport"],
      ["⚾",0.6,"baseball","ball sport"],
      ["🥎",11,"softball","ball glove sports underarm"],
      ["🏀",0.6,"basketball","ball hoop sport"],
      ["🏐",1,"volleyball","ball game"],
      ["🏈",0.6,"american football","ball bowl sport super"],
      ["🏉",1,"rugby football","ball sport"],
      ["🎾",0.6,"tennis","ball racquet sport"],
      ["🥏",11,"flying disc","ultimate"],
      ["🎳",0.6,"bowling","ball game sport strike"],
      ["🏏",1,"cricket game","ball bat"],
      ["🏑",1,"field hockey","ball game stick"],
      ["🏒",1,"ice hockey","game puck stick"],
      ["🥍",11,"lacrosse","ball goal sports stick"],
      ["🏓",1,"ping pong","ball bat game paddle pingpong table tennis"],
      ["🏸",1,"badminton","birdie game racquet shuttlecock"],
      ["🥊",3,"boxing glove",""],
      ["🥋",3,"martial arts uniform","judo karate taekwondo"],
      ["🥅",3,"goal net",""],
      ["⛳",0.6,"flag in hole","golf sport"],
      ["⛸️",0.7,"ice skate","skating"],
      ["🎣",0.6,"fishing pole","entertainment fish sport and"],
      ["🤿",12,"diving mask","scuba snorkeling"],
      ["🎽",0.6,"running shirt","athletics sash with"],
      ["🎿",0.6,"skis","ski snow sport"],
      ["🛷",5,"sled","luge sledge sleigh snow toboggan"],
      ["🥌",5,"curling stone","game rock"],
      ["🎯",0.6,"bullseye","bull dart direct entertainment game hit target"],
      ["🪀",12,"yo-yo","fluctuate toy yo"],
      ["🪁",12,"kite","fly soar"],
      ["🔫",0.6,"water pistol","gun handgun revolver tool weapon"],
      ["🎱",0.6,"pool 8 ball","8ball billiard eight game"],
      ["🔮",0.6,"crystal ball","fairy fairytale fantasy fortune future magic tale tool"],
      ["🪄",13,"magic wand","magician witch wizard"],
      ["🎮",0.6,"video game","controller entertainment"],
      ["🕹️",0.7,"joystick","game video videogame"],
      ["🎰",0.6,"slot machine","casino gamble gambling game slots"],
      ["🎲",0.6,"game die","dice entertainment"],
      ["🧩",11,"puzzle piece","clue interlocking jigsaw"],
      ["🧸",11,"teddy bear","plaything plush stuffed toy"],
      ["🪅",13,"piñata","candy celebrate celebration cinco de festive mayo party pinada pinata"],
      ["🪩",14,"mirror ball","dance disco glitter party"],
      ["🪆",13,"nesting dolls","babooshka baboushka babushka doll matryoshka russia"],
      ["♠️",0.6,"spade suit","card game spades"],
      ["♥️",0.6,"heart suit","card emotion game hearts"],
      ["♦️",0.6,"diamond suit","card game diamonds"],
      ["♣️",0.6,"club suit","card clubs game"],
      ["♟️",11,"chess pawn","dupe expendable"],
      ["🃏",0.6,"joker","card game wildcard black"],
      ["🀄",0.6,"mahjong red dragon","game"],
      ["🎴",0.6,"flower playing cards","japanese card game"],
      ["🎭",0.6,"performing arts","actor actress art entertainment mask theater theatre thespian"],
      ["🖼️",0.7,"framed picture","art frame museum painting"],
      ["🎨",0.6,"artist palette","art artsy arty colorful creative entertainment museum painter painting"],
      ["🧵",11,"thread","needle sewing spool string"],
      ["🪡",13,"sewing needle","embroidery sew stitches sutures tailoring thread"],
      ["🧶",11,"yarn","ball crochet knit"],
      ["🪢",13,"knot","cord rope tangled tie twine twist"],
      "objects",
      ["👓",0.6,"glasses","clothing eye eyeglasses eyewear"],
      ["🕶️",0.7,"sunglasses","dark eye eyewear glasses"],
      ["🥽",11,"goggles","dive eye protection scuba swimming welding"],
      ["🥼",11,"lab coat","clothes doctor dr experiment jacket scientist white"],
      ["🦺",12,"safety vest","emergency"],
      ["👔",0.6,"necktie","clothing employed serious shirt tie"],
      ["👕",0.6,"t-shirt","blue casual clothes clothing collar dressed shirt shopping tshirt weekend"],
      ["👖",0.6,"jeans","blue casual clothes clothing denim dressed pants shopping trousers weekend"],
      ["🧣",5,"scarf","bundle cold neck up"],
      ["🧤",5,"gloves","hand"],
      ["🧥",5,"coat","brr bundle cold jacket up"],
      ["🧦",5,"socks","stocking"],
      ["👗",0.6,"dress","clothes clothing dressed fancy shopping"],
      ["👘",0.6,"kimono","clothing comfortable"],
      ["🥻",12,"sari","clothing dress"],
      ["🩱",12,"one-piece swimsuit","bathing suit one piece"],
      ["🩲",12,"briefs","bathing one-piece suit swimsuit underwear swim brief"],
      ["🩳",12,"shorts","bathing pants suit swimsuit underwear"],
      ["👙",0.6,"bikini","bathing beach clothing pool suit swim"],
      ["👚",0.6,"woman’s clothes","blouse clothing collar dress dressed lady shirt shopping woman womans"],
      ["🪭",15,"folding hand fan","clack clap cool cooling dance flirt flutter hot shy"],
      ["👛",0.6,"purse","clothes clothing coin dress fancy handbag shopping"],
      ["👜",0.6,"handbag","bag clothes clothing dress lady purse shopping"],
      ["👝",0.6,"clutch bag","clothes clothing dress handbag pouch purse"],
      ["🛍️",0.7,"shopping bags","bag hotel"],
      ["🎒",0.6,"backpack","backpacking bag bookbag education rucksack satchel school"],
      ["🩴",13,"thong sandal","beach flip flop sandals shoe thongs zōri"],
      ["👞",0.6,"man’s shoe","brown clothes clothing feet foot kick man shoes shopping mans"],
      ["👟",0.6,"running shoe","athletic clothes clothing fast kick shoes shopping sneaker tennis"],
      ["🥾",11,"hiking boot","backpacking brown camping outdoors shoe"],
      ["🥿",11,"flat shoe","ballet comfy flats slip-on slipper"],
      ["👠",0.6,"high-heeled shoe","clothes clothing dress fashion heel heels shoes shopping stiletto woman high"],
      ["👡",0.6,"woman’s sandal","clothing shoe woman"],
      ["🩰",12,"ballet shoes","dance"],
      ["👢",0.6,"woman’s boot","clothes clothing dress shoe shoes shopping woman"],
      ["🪮",15,"hair pick","afro comb groom"],
      ["👑",0.6,"crown","clothing family king medieval queen royal royalty win"],
      ["👒",0.6,"woman’s hat","clothes clothing garden hats party woman womans"],
      ["🎩",0.6,"top hat","clothes clothing fancy formal magic tophat"],
      ["🎓",0.6,"graduation cap","celebration clothing education hat scholar mortar board"],
      ["🧢",5,"billed cap","baseball bent dad hat"],
      ["🪖",13,"military helmet","army soldier war warrior"],
      ["⛑️",0.7,"rescue worker’s helmet","aid cross face hat worker"],
      ["📿",1,"prayer beads","clothing necklace religion"],
      ["💄",0.6,"lipstick","cosmetics date makeup"],
      ["💍",0.6,"ring","diamond engaged engagement married romance shiny sparkling wedding"],
      ["💎",0.6,"gem stone","diamond engagement jewel money romance wedding"],
      ["🔇",1,"muted speaker","mute quiet silent sound"],
      ["🔈",0.7,"speaker low volume","soft sound"],
      ["🔉",1,"speaker medium volume","sound"],
      ["🔊",0.6,"speaker high volume","loud music sound"],
      ["📢",0.6,"loudspeaker","address communication loud public sound"],
      ["📣",0.6,"megaphone","cheering sound mega"],
      ["📯",1,"postal horn","post"],
      ["🔔",0.6,"bell","break church sound"],
      ["🔕",1,"bell with slash","forbidden mute no not prohibited quiet silent sound"],
      ["🎼",0.6,"musical score","music note"],
      ["🎵",0.6,"musical note","music sound"],
      ["🎶",0.6,"musical notes","music note sound"],
      ["🎙️",0.7,"studio microphone","mic music"],
      ["🎚️",0.7,"level slider","music"],
      ["🎛️",0.7,"control knobs","music"],
      ["🎤",0.6,"microphone","karaoke mic music sing sound"],
      ["🎧",0.6,"headphone","earbud sound headphones"],
      ["📻",0.6,"radio","entertainment tbt video"],
      ["🎷",0.6,"saxophone","instrument music sax"],
      ["🎺",0.6,"trumpet","instrument music"],
      ["🪊",17,"trombone","brass instrument jazz music sad slide"],
      ["🪗",13,"accordion","box concertina instrument music squeeze squeezebox"],
      ["🎸",0.6,"guitar","instrument music strat"],
      ["🎹",0.6,"musical keyboard","instrument music piano"],
      ["🎻",0.6,"violin","instrument music"],
      ["🪕",12,"banjo","music stringed"],
      ["🥁",3,"drum","drumsticks music"],
      ["🪘",13,"long drum","beat conga instrument rhythm"],
      ["🪇",15,"maracas","cha dance instrument music party percussion rattle shake shaker"],
      ["🪈",15,"flute","band fife flautist instrument marching music orchestra piccolo pipe recorder woodwind"],
      ["🪉",16,"harp","cupid instrument love music orchestra"],
      ["📱",0.6,"mobile phone","cell communication telephone iphone"],
      ["📲",0.6,"mobile phone with arrow","build call cell communication receive telephone calling"],
      ["☎️",0.6,"telephone","phone"],
      ["📞",0.6,"telephone receiver","communication phone voip"],
      ["📟",0.6,"pager","communication"],
      ["📠",0.6,"fax machine","communication"],
      ["🔋",0.6,"battery",""],
      ["🪫",14,"low battery","drained electronic energy power"],
      ["🔌",0.6,"electric plug","electricity"],
      ["💻",0.6,"laptop","computer office pc personal"],
      ["🖥️",0.7,"desktop computer","monitor"],
      ["🖨️",0.7,"printer","computer"],
      ["⌨️",1,"keyboard","computer"],
      ["🖱️",0.7,"computer mouse",""],
      ["🖲️",0.7,"trackball","computer"],
      ["💽",0.6,"computer disk","minidisk optical minidisc"],
      ["💾",0.6,"floppy disk","computer"],
      ["💿",0.6,"optical disk","cd blu-ray computer dvd"],
      ["📀",0.6,"dvd","blu-ray cd computer disk optical"],
      ["🧮",11,"abacus","calculation calculator"],
      ["🎥",0.6,"movie camera","bollywood cinema film hollywood record"],
      ["🎞️",0.7,"film frames","cinema movie strip"],
      ["📽️",0.7,"film projector","cinema movie video"],
      ["🎬",0.6,"clapper board","action movie"],
      ["📺",0.6,"television","tv video"],
      ["📷",0.6,"camera","photo selfie snap tbt trip video"],
      ["📸",1,"camera with flash","video"],
      ["📹",0.6,"video camera","camcorder tbt"],
      ["📼",0.6,"videocassette","old school tape vcr vhs video"],
      ["🔍",0.6,"magnifying glass tilted left","lab left-pointing science search tool mag"],
      ["🔎",0.6,"magnifying glass tilted right","contact lab right-pointing science search tool mag"],
      ["🕯️",0.7,"candle","light"],
      ["💡",0.6,"light bulb","comic electric idea"],
      ["🔦",0.6,"flashlight","electric light tool torch"],
      ["🏮",0.6,"red paper lantern","bar light restaurant izakaya"],
      ["🪔",12,"diya lamp","light oil"],
      ["📔",0.6,"notebook with decorative cover","book decorated education school writing"],
      ["📕",0.6,"closed book","education"],
      ["📖",0.6,"open book","education fantasy knowledge library novels reading"],
      ["📗",0.6,"green book","education fantasy library reading"],
      ["📘",0.6,"blue book","education fantasy library reading"],
      ["📙",0.6,"orange book","education fantasy library reading"],
      ["📚",0.6,"books","book education fantasy knowledge library novels reading school study"],
      ["📓",0.6,"notebook",""],
      ["📒",0.6,"ledger","notebook"],
      ["📃",0.6,"page with curl","document paper"],
      ["📜",0.6,"scroll","paper"],
      ["📄",0.6,"page facing up","document paper"],
      ["📰",0.6,"newspaper","communication news paper"],
      ["🗞️",0.7,"rolled-up newspaper","news paper rolled roll"],
      ["📑",0.6,"bookmark tabs","mark marker"],
      ["🔖",0.6,"bookmark","mark"],
      ["🏷️",0.7,"label","tag"],
      ["🪙",13,"coin","dollar euro gold metal money rich silver treasure"],
      ["💰",0.6,"money bag","bank bet billion cash cost dollar gold million moneybag paid paying pot rich win"],
      ["🪎",17,"treasure chest","gem gold jewels loot money prize silver valuables wealth"],
      ["💴",0.6,"yen banknote","bank bill currency money note"],
      ["💵",0.6,"dollar banknote","bank bill currency money note"],
      ["💶",1,"euro banknote","100 bank bill currency money note rich"],
      ["💷",1,"pound banknote","bank bill billion cash currency money note pounds"],
      ["💸",0.6,"money with wings","bank banknote bill billion cash dollar fly million note pay"],
      ["💳",0.6,"credit card","bank cash charge money pay"],
      ["🧾",11,"receipt","accounting bookkeeping evidence invoice proof"],
      ["💹",0.6,"chart increasing with yen","bank currency graph growth market money rise trend upward"],
      ["✉️",0.6,"envelope","e-mail email letter"],
      ["📧",0.6,"e-mail","email letter mail"],
      ["📨",0.6,"incoming envelope","delivering e-mail email letter mail receive sent"],
      ["📩",0.6,"envelope with arrow","communication down e-mail email letter mail outgoing send sent"],
      ["📤",0.6,"outbox tray","box email letter mail sent"],
      ["📥",0.6,"inbox tray","box email letter mail receive zero"],
      ["📦",0.6,"package","box communication delivery parcel shipping"],
      ["📫",0.6,"closed mailbox with raised flag","communication mail postbox"],
      ["📪",0.6,"closed mailbox with lowered flag","mail postbox"],
      ["📬",0.7,"open mailbox with raised flag","mail postbox"],
      ["📭",0.7,"open mailbox with lowered flag","mail postbox no"],
      ["📮",0.6,"postbox","mail mailbox"],
      ["🗳️",0.7,"ballot box with ballot",""],
      ["✏️",0.6,"pencil","pencil2"],
      ["✒️",0.6,"black nib","pen"],
      ["🖋️",0.7,"fountain pen",""],
      ["🖊️",0.7,"pen","ballpoint"],
      ["🖌️",0.7,"paintbrush","painting"],
      ["🖍️",0.7,"crayon",""],
      ["📝",0.6,"memo","communication media notes pencil"],
      ["🪌",18,"eraser","correction delete drawing erase error mistake remove rub undo writing"],
      ["💼",0.6,"briefcase","office"],
      ["📁",0.6,"file folder",""],
      ["📂",0.6,"open file folder",""],
      ["🗂️",0.7,"card index dividers",""],
      ["📅",0.6,"calendar","date"],
      ["📆",0.6,"tear-off calendar",""],
      ["🗒️",0.7,"spiral notepad","note pad"],
      ["🗓️",0.7,"spiral calendar","pad"],
      ["📇",0.6,"card index","old rolodex school"],
      ["📈",0.6,"chart increasing","data graph growth right trend up upward with upwards"],
      ["📉",0.6,"chart decreasing","data down downward graph negative trend with downwards"],
      ["📊",0.6,"bar chart","data graph"],
      ["📋",0.6,"clipboard","do list notes"],
      ["📌",0.6,"pushpin","collage pin"],
      ["📍",0.6,"round pushpin","location map pin"],
      ["📎",0.6,"paperclip",""],
      ["🖇️",0.7,"linked paperclips","link paperclip"],
      ["📏",0.6,"straight ruler","angle edge math straightedge"],
      ["📐",0.6,"triangular ruler","angle math rule set slide triangle"],
      ["✂️",0.6,"scissors","cut cutting paper tool"],
      ["🗃️",0.7,"card file box",""],
      ["🗄️",0.7,"file cabinet","filing paper"],
      ["🗑️",0.7,"wastebasket","can garbage trash waste"],
      ["🔒",0.6,"locked","closed lock private"],
      ["🔓",0.6,"unlocked","cracked lock open unlock"],
      ["🔏",0.6,"locked with pen","ink lock nib privacy"],
      ["🔐",0.6,"locked with key","bike closed lock secure"],
      ["🔑",0.6,"key","keys lock major password unlock"],
      ["🗝️",0.7,"old key","clue lock"],
      ["🪍",18,"net with handle","catch collect mesh trap"],
      ["🔨",0.6,"hammer","home improvement repairs tool"],
      ["🪓",12,"axe","ax chop hatchet split wood"],
      ["⛏️",0.7,"pick","hammer mining tool"],
      ["⚒️",1,"hammer and pick","tool"],
      ["🛠️",0.7,"hammer and wrench","spanner tool"],
      ["🗡️",0.7,"dagger","knife weapon"],
      ["⚔️",1,"crossed swords","weapon"],
      ["💣",0.6,"bomb","boom comic dangerous explosion hot"],
      ["🪃",13,"boomerang","rebound repercussion weapon"],
      ["🏹",1,"bow and arrow","sagittarius archer archery tool weapon zodiac"],
      ["🛡️",0.7,"shield","weapon"],
      ["🪚",13,"carpentry saw","carpenter cut lumber tool trim"],
      ["🔧",0.6,"wrench","home improvement spanner tool"],
      ["🪛",13,"screwdriver","flathead handy screw tool"],
      ["🔩",0.6,"nut and bolt","home improvement tool"],
      ["⚙️",1,"gear","cog cogwheel tool"],
      ["🗜️",0.7,"clamp","compress tool vice"],
      ["⚖️",1,"balance scale","libra justice scales tool weight zodiac"],
      ["🦯",12,"white cane","accessibility blind probing"],
      ["🔗",0.6,"link","links"],
      ["⛓️‍💥",15.1,"broken chain","break breaking cuffs freedom"],
      ["⛓️",0.7,"chains","chain"],
      ["🪝",13,"hook","catch crook curve ensnare point selling"],
      ["🧰",11,"toolbox","box chest mechanic red tool"],
      ["🧲",11,"magnet","attraction horseshoe magnetic negative positive shape u"],
      ["🪜",13,"ladder","climb rung step"],
      ["🪏",16,"shovel","bury dig garden hole plant scoop snow spade"],
      ["⚗️",1,"alembic","chemistry tool"],
      ["🧪",11,"test tube","chemist chemistry experiment lab science"],
      ["🧫",11,"petri dish","bacteria biologist biology culture lab"],
      ["🧬",11,"dna","biologist evolution gene genetics life"],
      ["🔬",1,"microscope","experiment lab science tool"],
      ["🔭",1,"telescope","contact extraterrestrial science tool"],
      ["📡",0.6,"satellite antenna","aliens contact dish science"],
      ["💉",0.6,"syringe","doctor flu medicine needle shot sick tool vaccination"],
      ["🩸",12,"drop of blood","bleed donation injury medicine menstruation"],
      ["💊",0.6,"pill","doctor drugs medicated medicine pills sick vitamin"],
      ["🩹",12,"adhesive bandage",""],
      ["🩼",14,"crutch","aid cane disability help hurt injured mobility stick"],
      ["🩺",12,"stethoscope","doctor heart medicine"],
      ["🩻",14,"x-ray","bones doctor medical skeleton skull xray x ray"],
      ["🚪",0.6,"door","back closet front"],
      ["🛗",13,"elevator","accessibility hoist lift"],
      ["🪞",13,"mirror","makeup reflection reflector speculum"],
      ["🪟",13,"window","air frame fresh opening transparent view"],
      ["🛏️",0.7,"bed","hotel sleep"],
      ["🛋️",0.7,"couch and lamp","hotel"],
      ["🪑",12,"chair","seat sit"],
      ["🚽",0.6,"toilet","bathroom"],
      ["🪠",13,"plunger","cup force plumber poop suction toilet"],
      ["🚿",1,"shower","water"],
      ["🛁",1,"bathtub","bath"],
      ["🪤",13,"mouse trap","bait cheese lure mousetrap snare"],
      ["🪒",12,"razor","sharp shave"],
      ["🧴",11,"lotion bottle","moisturizer shampoo sunscreen"],
      ["🧷",11,"safety pin","diaper punk rock"],
      ["🧹",11,"broom","cleaning sweeping witch"],
      ["🧺",11,"basket","farming laundry picnic"],
      ["🧻",11,"roll of paper","toilet towels"],
      ["🪣",13,"bucket","cask pail vat"],
      ["🧼",11,"soap","bar bathing clean cleaning lather soapdish"],
      ["🫧",14,"bubbles","bubble burp clean floating pearl soap underwater"],
      ["🪥",13,"toothbrush","bathroom brush clean dental hygiene teeth toiletry"],
      ["🧽",11,"sponge","absorbing cleaning porous soak"],
      ["🧯",11,"fire extinguisher","extinguish quench"],
      ["🛒",3,"shopping cart","trolley"],
      ["🚬",0.6,"cigarette","smoking"],
      ["⚰️",1,"coffin","dead death vampire"],
      ["🪦",13,"headstone","cemetery dead grave graveyard memorial rip tomb tombstone"],
      ["⚱️",1,"funeral urn","ashes death"],
      ["🧿",11,"nazar amulet","bead blue charm evil-eye talisman"],
      ["🪬",14,"hamsa","fatima mary miriam amulet fortune guide hand palm protect protection"],
      ["🗿",0.6,"moai","face moyai statue stoneface travel"],
      ["🪧",13,"placard","card demonstration notice picket plaque protest sign"],
      ["🪪",14,"identification card","id credentials document license security"],
      "symbols",
      ["🏧",0.6,"ATM sign","automated bank cash money teller"],
      ["🚮",1,"litter in bin sign","litterbin put its place"],
      ["🚰",1,"potable water","drinking"],
      ["♿",0.6,"wheelchair symbol","access handicap"],
      ["🚹",0.6,"men’s room","wc bathroom lavatory man restroom toilet mens"],
      ["🚺",0.6,"women’s room","wc bathroom lavatory restroom toilet woman womens"],
      ["🚻",0.6,"restroom","wc bathroom lavatory toilet"],
      ["🚼",0.6,"baby symbol","changing"],
      ["🚾",0.6,"water closet","wc bathroom lavatory restroom toilet"],
      ["🛂",1,"passport control",""],
      ["🛃",1,"customs","packing"],
      ["🛄",1,"baggage claim","arrived bags case checked journey packing plane ready travel trip"],
      ["🛅",1,"left luggage","baggage case locker"],
      ["⚠️",0.6,"warning","caution"],
      ["🚸",1,"children crossing","child pedestrian traffic"],
      ["⛔",0.6,"no entry","do fail forbidden not pass prohibited traffic"],
      ["🚫",0.6,"prohibited","entry forbidden no not smoke sign"],
      ["🚳",1,"no bicycles","bicycle bike forbidden not prohibited"],
      ["🚭",0.6,"no smoking","forbidden not prohibited smoke"],
      ["🚯",1,"no littering","forbidden litter not prohibited do"],
      ["🚱",1,"non-potable water","dry non-drinking prohibited"],
      ["🚷",1,"no pedestrians","forbidden not pedestrian prohibited"],
      ["📵",1,"no mobile phones","cell forbidden not phone prohibited telephone"],
      ["🔞",0.6,"no one under eighteen","18 age forbidden not prohibited restriction underage"],
      ["☢️",1,"radioactive","sign"],
      ["☣️",1,"biohazard","sign"],
      ["⬆️",0.6,"up arrow","cardinal direction north"],
      ["↗️",0.6,"up-right arrow","direction intercardinal northeast upper right"],
      ["➡️",0.6,"right arrow","cardinal direction east"],
      ["↘️",0.6,"down-right arrow","direction intercardinal southeast lower right"],
      ["⬇️",0.6,"down arrow","cardinal direction south"],
      ["↙️",0.6,"down-left arrow","direction intercardinal southwest lower left"],
      ["⬅️",0.6,"left arrow","cardinal direction west"],
      ["↖️",0.6,"up-left arrow","direction intercardinal northwest upper left"],
      ["↕️",0.6,"up-down arrow","up down"],
      ["↔️",0.6,"left-right arrow","left right"],
      ["↩️",0.6,"right arrow curving left","leftwards with hook"],
      ["↪️",0.6,"left arrow curving right","hook"],
      ["⤴️",0.6,"right arrow curving up","heading"],
      ["⤵️",0.6,"right arrow curving down","heading"],
      ["🔃",0.6,"clockwise vertical arrows","arrow refresh reload"],
      ["🔄",1,"counterclockwise arrows button","again anticlockwise arrow deja refresh rewindershins vu"],
      ["🔙",0.6,"BACK arrow",""],
      ["🔚",0.6,"END arrow",""],
      ["🔛",0.6,"ON! arrow","mark on"],
      ["🔜",0.6,"SOON arrow","brb omw"],
      ["🔝",0.6,"TOP arrow","homie up"],
      ["🛐",1,"place of worship","pray religion"],
      ["⚛️",1,"atom symbol","atheist"],
      ["🕉️",0.7,"om","hindu religion"],
      ["✡️",0.7,"star of David","jew jewish judaism religion"],
      ["☸️",0.7,"wheel of dharma","buddhist religion"],
      ["☯️",0.7,"yin yang","difficult lives religion tao taoist total yinyang"],
      ["✝️",0.7,"latin cross","christian christ religion"],
      ["☦️",1,"orthodox cross","christian religion"],
      ["☪️",0.7,"star and crescent","muslim islam ramadan religion"],
      ["☮️",1,"peace symbol","healing peaceful"],
      ["🕎",1,"menorah","candelabrum candlestick hanukkah jewish judaism religion"],
      ["🔯",0.6,"dotted six-pointed star","fortune jewish judaism six pointed"],
      ["🪯",15,"khanda","deg fateh khalsa sikh sikhism tegh religion"],
      ["♈",0.6,"Aries","horoscope ram zodiac"],
      ["♉",0.6,"Taurus","bull horoscope ox zodiac"],
      ["♊",0.6,"Gemini","horoscope twins zodiac"],
      ["♋",0.6,"Cancer","crab horoscope zodiac"],
      ["♌",0.6,"Leo","horoscope lion zodiac"],
      ["♍",0.6,"Virgo","horoscope zodiac"],
      ["♎",0.6,"Libra","balance horoscope justice scales zodiac"],
      ["♏",0.6,"Scorpio","scorpius horoscope scorpion zodiac"],
      ["♐",0.6,"Sagittarius","archer horoscope zodiac"],
      ["♑",0.6,"Capricorn","goat horoscope zodiac"],
      ["♒",0.6,"Aquarius","bearer horoscope water zodiac"],
      ["♓",0.6,"Pisces","fish horoscope zodiac"],
      ["⛎",0.6,"Ophiuchus","bearer serpent snake zodiac"],
      ["🔀",1,"shuffle tracks button","arrow crossed twisted rightwards arrows"],
      ["🔁",1,"repeat button","arrow clockwise"],
      ["🔂",1,"repeat single button","arrow clockwise once one"],
      ["▶️",0.6,"play button","arrow right triangle forward"],
      ["⏩",0.6,"fast-forward button","arrow double fast forward"],
      ["⏭️",0.7,"next track button","arrow scene triangle"],
      ["⏯️",1,"play or pause button","arrow right triangle"],
      ["◀️",0.6,"reverse button","arrow left triangle backward"],
      ["⏪",0.6,"fast reverse button","arrow double rewind"],
      ["⏮️",0.7,"last track button","arrow previous scene triangle"],
      ["🔼",0.6,"upwards button","arrow red up small"],
      ["⏫",0.6,"fast up button","arrow double"],
      ["🔽",0.6,"downwards button","arrow down red small"],
      ["⏬",0.6,"fast down button","arrow double"],
      ["⏸️",0.7,"pause button","bar double vertical"],
      ["⏹️",0.7,"stop button","square"],
      ["⏺️",0.7,"record button","circle"],
      ["⏏️",1,"eject button",""],
      ["🎦",0.6,"cinema","camera film movie"],
      ["🔅",1,"dim button","brightness low"],
      ["🔆",1,"bright button","brightness light high"],
      ["📶",0.6,"antenna bars","bar cell communication mobile phone signal telephone strength"],
      ["🛜",15,"wireless","broadband computer connectivity hotspot internet network router smartphone wi-fi wifi wlan"],
      ["📳",0.6,"vibration mode","cell communication mobile phone telephone"],
      ["📴",0.6,"mobile phone off","cell telephone"],
      ["♀️",4,"female sign","woman"],
      ["♂️",4,"male sign","man"],
      ["⚧️",13,"transgender symbol",""],
      ["✖️",0.6,"multiply","cancel multiplication sign x × heavy"],
      ["➕",0.6,"plus","+ heavy sign"],
      ["➖",0.6,"minus","- heavy math sign −"],
      ["➗",0.6,"divide","division heavy math sign ÷"],
      ["🟰",14,"heavy equals sign","answer equal equality math"],
      ["♾️",11,"infinity","forever unbounded universal"],
      ["‼️",0.6,"double exclamation mark","! !! bangbang punctuation"],
      ["⁉️",0.6,"exclamation question mark","! !? ? interrobang punctuation"],
      ["❓",0.6,"red question mark","? punctuation"],
      ["❔",0.6,"white question mark","? outlined punctuation grey"],
      ["❕",0.6,"white exclamation mark","! bang outlined punctuation grey"],
      ["❗",0.6,"red exclamation mark","! bang punctuation heavy"],
      ["〰️",0.6,"wavy dash","punctuation"],
      ["💱",0.6,"currency exchange","bank money"],
      ["💲",0.6,"heavy dollar sign","billion cash charge currency million money pay"],
      ["⚕️",4,"medical symbol","aesculapius medicine staff"],
      ["♻️",0.6,"recycling symbol","recycle"],
      ["⚜️",1,"fleur-de-lis","knights fleur de lis"],
      ["🔱",0.6,"trident emblem","anchor poseidon ship tool"],
      ["📛",0.6,"name badge",""],
      ["🔰",0.6,"Japanese symbol for beginner","chevron green leaf tool yellow"],
      ["⭕",0.6,"hollow red circle","heavy large o"],
      ["✅",0.6,"check mark button","checked checkmark complete completed done fixed tick ✓ white"],
      ["☑️",0.6,"check box with check","ballot checked done off tick ✓"],
      ["✔️",0.6,"check mark","checked checkmark done heavy tick ✓"],
      ["❌",0.6,"cross mark","cancel multiplication multiply x ×"],
      ["❎",0.6,"cross mark button","multiplication multiply square x × negative squared"],
      ["➰",0.6,"curly loop","curl"],
      ["➿",1,"double curly loop","curl"],
      ["〽️",0.6,"part alternation mark",""],
      ["✳️",0.6,"eight-spoked asterisk","* eight spoked"],
      ["✴️",0.6,"eight-pointed star","* eight pointed black"],
      ["❇️",0.6,"sparkle","*"],
      ["©️",0.6,"copyright","c"],
      ["®️",0.6,"registered","r"],
      ["™️",0.6,"trade mark","tm trademark"],
      ["🫟",16,"splatter","drip holi ink liquid mess paint spill stain"],
      ["#️⃣",0.6,"keycap: #","hash"],
      ["*️⃣",2,"keycap: *","asterisk"],
      ["0️⃣",0.6,"keycap: 0","zero"],
      ["1️⃣",0.6,"keycap: 1","one"],
      ["2️⃣",0.6,"keycap: 2","two"],
      ["3️⃣",0.6,"keycap: 3","three"],
      ["4️⃣",0.6,"keycap: 4","four"],
      ["5️⃣",0.6,"keycap: 5","five"],
      ["6️⃣",0.6,"keycap: 6","six"],
      ["7️⃣",0.6,"keycap: 7","seven"],
      ["8️⃣",0.6,"keycap: 8","eight"],
      ["9️⃣",0.6,"keycap: 9","nine"],
      ["🔟",0.6,"keycap: 10","ten"],
      ["🔠",0.6,"input latin uppercase","abcd letters capital"],
      ["🔡",0.6,"input latin lowercase","abcd letters"],
      ["🔢",0.6,"input numbers","1234"],
      ["🔣",0.6,"input symbols","% & ♪ 〒"],
      ["🔤",0.6,"input latin letters","abc alphabet"],
      ["🅰️",0.6,"A button (blood type)","blood type"],
      ["🆎",0.6,"AB button (blood type)","blood type"],
      ["🅱️",0.6,"B button (blood type)","blood type"],
      ["🆑",0.6,"CL button",""],
      ["🆒",0.6,"COOL button",""],
      ["🆓",0.6,"FREE button",""],
      ["ℹ️",0.6,"information","i source"],
      ["🆔",0.6,"ID button","identity"],
      ["Ⓜ️",0.6,"circled M","circle"],
      ["🆕",0.6,"NEW button",""],
      ["🆖",0.6,"NG button",""],
      ["🅾️",0.6,"O button (blood type)","blood type o2"],
      ["🆗",0.6,"OK button","okay"],
      ["🅿️",0.6,"P button","parking"],
      ["🆘",0.6,"SOS button","help"],
      ["🆙",0.6,"UP! button","up mark"],
      ["🆚",0.6,"VS button","versus"],
      ["🈁",0.6,"Japanese “here” button","here katakana koko"],
      ["🈂️",0.6,"Japanese “service charge” button","charge katakana service sa"],
      ["🈷️",0.6,"Japanese “monthly amount” button","amount ideograph monthly u6708"],
      ["🈶",0.6,"Japanese “not free of charge” button","charge ideograph not u6709"],
      ["🈯",0.6,"Japanese “reserved” button","ideograph reserved u6307"],
      ["🉐",0.6,"Japanese “bargain” button","bargain ideograph advantage"],
      ["🈹",0.6,"Japanese “discount” button","discount ideograph u5272"],
      ["🈚",0.6,"Japanese “free of charge” button","charge free ideograph u7121"],
      ["🈲",0.6,"Japanese “prohibited” button","ideograph prohibited u7981"],
      ["🉑",0.6,"Japanese “acceptable” button","acceptable ideograph accept"],
      ["🈸",0.6,"Japanese “application” button","application ideograph u7533"],
      ["🈴",0.6,"Japanese “passing grade” button","grade ideograph passing u5408"],
      ["🈳",0.6,"Japanese “vacancy” button","ideograph vacancy u7a7a"],
      ["㊗️",0.6,"Japanese “congratulations” button","congratulations ideograph"],
      ["㊙️",0.6,"Japanese “secret” button","ideograph secret"],
      ["🈺",0.6,"Japanese “open for business” button","business ideograph open u55b6"],
      ["🈵",0.6,"Japanese “no vacancy” button","ideograph no vacancy u6e80"],
      ["🔴",0.6,"red circle","geometric"],
      ["🟠",12,"orange circle",""],
      ["🟡",12,"yellow circle",""],
      ["🟢",12,"green circle",""],
      ["🔵",0.6,"blue circle","geometric large"],
      ["🟣",12,"purple circle",""],
      ["🟤",12,"brown circle",""],
      ["⚫",0.6,"black circle","geometric"],
      ["⚪",0.6,"white circle","geometric"],
      ["🟥",12,"red square","card penalty"],
      ["🟧",12,"orange square",""],
      ["🟨",12,"yellow square","card penalty"],
      ["🟩",12,"green square",""],
      ["🟦",12,"blue square",""],
      ["🟪",12,"purple square",""],
      ["🟫",12,"brown square",""],
      ["⬛",0.6,"black large square","geometric"],
      ["⬜",0.6,"white large square","geometric"],
      ["◼️",0.6,"black medium square","geometric"],
      ["◻️",0.6,"white medium square","geometric"],
      ["◾",0.6,"black medium-small square","geometric medium small"],
      ["◽",0.6,"white medium-small square","geometric medium small"],
      ["▪️",0.6,"black small square","geometric"],
      ["▫️",0.6,"white small square","geometric"],
      ["🔶",0.6,"large orange diamond","geometric"],
      ["🔷",0.6,"large blue diamond","geometric"],
      ["🔸",0.6,"small orange diamond","geometric"],
      ["🔹",0.6,"small blue diamond","geometric"],
      ["🔺",0.6,"red triangle pointed up","geometric small"],
      ["🔻",0.6,"red triangle pointed down","geometric small"],
      ["💠",0.6,"diamond with a dot","comic geometric shape inside"],
      ["🔘",0.6,"radio button","geometric"],
      ["🔳",0.6,"white square button","geometric outlined"],
      ["🔲",0.6,"black square button","geometric"],
      "flags",
      ["🏁",0.6,"chequered flag","checkered finish flags game race racing sport win"],
      ["🚩",0.6,"triangular flag","construction golf post on"],
      ["🎌",0.6,"crossed flags","japanese celebration cross"],
      ["🏴",1,"black flag","waving"],
      ["🏳️",0.7,"white flag","waving"],
      ["🏳️‍🌈",4,"rainbow flag","bisexual gay genderqueer glbt glbtq lesbian lgbt lgbtq lgbtqia pride queer trans transgender"],
      ["🏳️‍⚧️",13,"transgender flag","blue light pink white"],
      ["🏴‍☠️",11,"pirate flag","jolly roger plunder treasure"],
      ["🇦🇨",2,"flag: Ascension Island","ac"],
      ["🇦🇩",2,"flag: Andorra","ad"],
      ["🇦🇪",2,"flag: United Arab Emirates","ae"],
      ["🇦🇫",2,"flag: Afghanistan","af"],
      ["🇦🇬",2,"flag: Antigua & Barbuda","ag"],
      ["🇦🇮",2,"flag: Anguilla","ai"],
      ["🇦🇱",2,"flag: Albania","al"],
      ["🇦🇲",2,"flag: Armenia","am"],
      ["🇦🇴",2,"flag: Angola","ao"],
      ["🇦🇶",2,"flag: Antarctica","aq"],
      ["🇦🇷",2,"flag: Argentina","ar"],
      ["🇦🇸",2,"flag: American Samoa","as"],
      ["🇦🇹",2,"flag: Austria","at"],
      ["🇦🇺",2,"flag: Australia","au"],
      ["🇦🇼",2,"flag: Aruba","aw"],
      ["🇦🇽",2,"flag: Åland Islands","ax aland"],
      ["🇦🇿",2,"flag: Azerbaijan","az"],
      ["🇧🇦",2,"flag: Bosnia & Herzegovina","ba"],
      ["🇧🇧",2,"flag: Barbados","bb"],
      ["🇧🇩",2,"flag: Bangladesh","bd"],
      ["🇧🇪",2,"flag: Belgium","be"],
      ["🇧🇫",2,"flag: Burkina Faso","bf"],
      ["🇧🇬",2,"flag: Bulgaria","bg"],
      ["🇧🇭",2,"flag: Bahrain","bh"],
      ["🇧🇮",2,"flag: Burundi","bi"],
      ["🇧🇯",2,"flag: Benin","bj"],
      ["🇧🇱",2,"flag: St. Barthélemy","bl st barthelemy"],
      ["🇧🇲",2,"flag: Bermuda","bm"],
      ["🇧🇳",2,"flag: Brunei","bn"],
      ["🇧🇴",2,"flag: Bolivia","bo"],
      ["🇧🇶",2,"flag: Caribbean Netherlands","bq"],
      ["🇧🇷",2,"flag: Brazil","br"],
      ["🇧🇸",2,"flag: Bahamas","bs"],
      ["🇧🇹",2,"flag: Bhutan","bt"],
      ["🇧🇻",2,"flag: Bouvet Island","bv"],
      ["🇧🇼",2,"flag: Botswana","bw"],
      ["🇧🇾",2,"flag: Belarus","by"],
      ["🇧🇿",2,"flag: Belize","bz"],
      ["🇨🇦",2,"flag: Canada","ca"],
      ["🇨🇨",2,"flag: Cocos (Keeling) Islands","cc"],
      ["🇨🇩",2,"flag: Congo - Kinshasa","cd"],
      ["🇨🇫",2,"flag: Central African Republic","cf"],
      ["🇨🇬",2,"flag: Congo - Brazzaville","cg"],
      ["🇨🇭",2,"flag: Switzerland","ch"],
      ["🇨🇮",2,"flag: Côte d’Ivoire","ci cote divoire"],
      ["🇨🇰",2,"flag: Cook Islands","ck"],
      ["🇨🇱",2,"flag: Chile","cl"],
      ["🇨🇲",2,"flag: Cameroon","cm"],
      ["🇨🇳",0.6,"flag: China","cn"],
      ["🇨🇴",2,"flag: Colombia","co"],
      ["🇨🇵",2,"flag: Clipperton Island","cp"],
      ["🇨🇶",16,"flag: Sark","cq"],
      ["🇨🇷",2,"flag: Costa Rica","cr"],
      ["🇨🇺",2,"flag: Cuba","cu"],
      ["🇨🇻",2,"flag: Cape Verde","cv"],
      ["🇨🇼",2,"flag: Curaçao","cw curacao"],
      ["🇨🇽",2,"flag: Christmas Island","cx"],
      ["🇨🇾",2,"flag: Cyprus","cy"],
      ["🇨🇿",2,"flag: Czechia","cz czech republic"],
      ["🇩🇪",0.6,"flag: Germany","de"],
      ["🇩🇬",2,"flag: Diego Garcia","dg"],
      ["🇩🇯",2,"flag: Djibouti","dj"],
      ["🇩🇰",2,"flag: Denmark","dk"],
      ["🇩🇲",2,"flag: Dominica","dm"],
      ["🇩🇴",2,"flag: Dominican Republic","do"],
      ["🇩🇿",2,"flag: Algeria","dz"],
      ["🇪🇦",2,"flag: Ceuta & Melilla","ea"],
      ["🇪🇨",2,"flag: Ecuador","ec"],
      ["🇪🇪",2,"flag: Estonia","ee"],
      ["🇪🇬",2,"flag: Egypt","eg"],
      ["🇪🇭",2,"flag: Western Sahara","eh"],
      ["🇪🇷",2,"flag: Eritrea","er"],
      ["🇪🇸",0.6,"flag: Spain","es"],
      ["🇪🇹",2,"flag: Ethiopia","et"],
      ["🇪🇺",2,"flag: European Union","eu"],
      ["🇫🇮",2,"flag: Finland","fi"],
      ["🇫🇯",2,"flag: Fiji","fj"],
      ["🇫🇰",2,"flag: Falkland Islands","fk"],
      ["🇫🇲",2,"flag: Micronesia","fm"],
      ["🇫🇴",2,"flag: Faroe Islands","fo"],
      ["🇫🇷",0.6,"flag: France","fr"],
      ["🇬🇦",2,"flag: Gabon","ga"],
      ["🇬🇧",0.6,"flag: United Kingdom","gb uk"],
      ["🇬🇩",2,"flag: Grenada","gd"],
      ["🇬🇪",2,"flag: Georgia","ge"],
      ["🇬🇫",2,"flag: French Guiana","gf"],
      ["🇬🇬",2,"flag: Guernsey","gg"],
      ["🇬🇭",2,"flag: Ghana","gh"],
      ["🇬🇮",2,"flag: Gibraltar","gi"],
      ["🇬🇱",2,"flag: Greenland","gl"],
      ["🇬🇲",2,"flag: Gambia","gm"],
      ["🇬🇳",2,"flag: Guinea","gn"],
      ["🇬🇵",2,"flag: Guadeloupe","gp"],
      ["🇬🇶",2,"flag: Equatorial Guinea","gq"],
      ["🇬🇷",2,"flag: Greece","gr"],
      ["🇬🇸",2,"flag: South Georgia & South Sandwich Islands","gs"],
      ["🇬🇹",2,"flag: Guatemala","gt"],
      ["🇬🇺",2,"flag: Guam","gu"],
      ["🇬🇼",2,"flag: Guinea-Bissau","gw guinea bissau"],
      ["🇬🇾",2,"flag: Guyana","gy"],
      ["🇭🇰",2,"flag: Hong Kong SAR China","hk"],
      ["🇭🇲",2,"flag: Heard Island & McDonald Islands","hm"],
      ["🇭🇳",2,"flag: Honduras","hn"],
      ["🇭🇷",2,"flag: Croatia","hr"],
      ["🇭🇹",2,"flag: Haiti","ht"],
      ["🇭🇺",2,"flag: Hungary","hu"],
      ["🇮🇨",2,"flag: Canary Islands","ic"],
      ["🇮🇩",2,"flag: Indonesia","id"],
      ["🇮🇪",2,"flag: Ireland","ie"],
      ["🇮🇱",2,"flag: Israel","il"],
      ["🇮🇲",2,"flag: Isle of Man","im"],
      ["🇮🇳",2,"flag: India","in"],
      ["🇮🇴",2,"flag: British Indian Ocean Territory","io"],
      ["🇮🇶",2,"flag: Iraq","iq"],
      ["🇮🇷",2,"flag: Iran","ir"],
      ["🇮🇸",2,"flag: Iceland","is"],
      ["🇮🇹",0.6,"flag: Italy","it"],
      ["🇯🇪",2,"flag: Jersey","je"],
      ["🇯🇲",2,"flag: Jamaica","jm"],
      ["🇯🇴",2,"flag: Jordan","jo"],
      ["🇯🇵",0.6,"flag: Japan","jp"],
      ["🇰🇪",2,"flag: Kenya","ke"],
      ["🇰🇬",2,"flag: Kyrgyzstan","kg"],
      ["🇰🇭",2,"flag: Cambodia","kh"],
      ["🇰🇮",2,"flag: Kiribati","ki"],
      ["🇰🇲",2,"flag: Comoros","km"],
      ["🇰🇳",2,"flag: St. Kitts & Nevis","kn st"],
      ["🇰🇵",2,"flag: North Korea","kp"],
      ["🇰🇷",0.6,"flag: South Korea","kr"],
      ["🇰🇼",2,"flag: Kuwait","kw"],
      ["🇰🇾",2,"flag: Cayman Islands","ky"],
      ["🇰🇿",2,"flag: Kazakhstan","kz"],
      ["🇱🇦",2,"flag: Laos","la"],
      ["🇱🇧",2,"flag: Lebanon","lb"],
      ["🇱🇨",2,"flag: St. Lucia","lc st"],
      ["🇱🇮",2,"flag: Liechtenstein","li"],
      ["🇱🇰",2,"flag: Sri Lanka","lk"],
      ["🇱🇷",2,"flag: Liberia","lr"],
      ["🇱🇸",2,"flag: Lesotho","ls"],
      ["🇱🇹",2,"flag: Lithuania","lt"],
      ["🇱🇺",2,"flag: Luxembourg","lu"],
      ["🇱🇻",2,"flag: Latvia","lv"],
      ["🇱🇾",2,"flag: Libya","ly"],
      ["🇲🇦",2,"flag: Morocco","ma"],
      ["🇲🇨",2,"flag: Monaco","mc"],
      ["🇲🇩",2,"flag: Moldova","md"],
      ["🇲🇪",2,"flag: Montenegro","me"],
      ["🇲🇫",2,"flag: St. Martin","mf st"],
      ["🇲🇬",2,"flag: Madagascar","mg"],
      ["🇲🇭",2,"flag: Marshall Islands","mh"],
      ["🇲🇰",2,"flag: North Macedonia","mk"],
      ["🇲🇱",2,"flag: Mali","ml"],
      ["🇲🇲",2,"flag: Myanmar (Burma)","mm"],
      ["🇲🇳",2,"flag: Mongolia","mn"],
      ["🇲🇴",2,"flag: Macao SAR China","mo macau"],
      ["🇲🇵",2,"flag: Northern Mariana Islands","mp"],
      ["🇲🇶",2,"flag: Martinique","mq"],
      ["🇲🇷",2,"flag: Mauritania","mr"],
      ["🇲🇸",2,"flag: Montserrat","ms"],
      ["🇲🇹",2,"flag: Malta","mt"],
      ["🇲🇺",2,"flag: Mauritius","mu"],
      ["🇲🇻",2,"flag: Maldives","mv"],
      ["🇲🇼",2,"flag: Malawi","mw"],
      ["🇲🇽",2,"flag: Mexico","mx"],
      ["🇲🇾",2,"flag: Malaysia","my"],
      ["🇲🇿",2,"flag: Mozambique","mz"],
      ["🇳🇦",2,"flag: Namibia","na"],
      ["🇳🇨",2,"flag: New Caledonia","nc"],
      ["🇳🇪",2,"flag: Niger","ne"],
      ["🇳🇫",2,"flag: Norfolk Island","nf"],
      ["🇳🇬",2,"flag: Nigeria","ng"],
      ["🇳🇮",2,"flag: Nicaragua","ni"],
      ["🇳🇱",2,"flag: Netherlands","nl"],
      ["🇳🇴",2,"flag: Norway","no"],
      ["🇳🇵",2,"flag: Nepal","np"],
      ["🇳🇷",2,"flag: Nauru","nr"],
      ["🇳🇺",2,"flag: Niue","nu"],
      ["🇳🇿",2,"flag: New Zealand","nz"],
      ["🇴🇲",2,"flag: Oman","om"],
      ["🇵🇦",2,"flag: Panama","pa"],
      ["🇵🇪",2,"flag: Peru","pe"],
      ["🇵🇫",2,"flag: French Polynesia","pf"],
      ["🇵🇬",2,"flag: Papua New Guinea","pg"],
      ["🇵🇭",2,"flag: Philippines","ph"],
      ["🇵🇰",2,"flag: Pakistan","pk"],
      ["🇵🇱",2,"flag: Poland","pl"],
      ["🇵🇲",2,"flag: St. Pierre & Miquelon","pm st"],
      ["🇵🇳",2,"flag: Pitcairn Islands","pn"],
      ["🇵🇷",2,"flag: Puerto Rico","pr"],
      ["🇵🇸",2,"flag: Palestinian Territories","ps"],
      ["🇵🇹",2,"flag: Portugal","pt"],
      ["🇵🇼",2,"flag: Palau","pw"],
      ["🇵🇾",2,"flag: Paraguay","py"],
      ["🇶🇦",2,"flag: Qatar","qa"],
      ["🇷🇪",2,"flag: Réunion","re reunion"],
      ["🇷🇴",2,"flag: Romania","ro"],
      ["🇷🇸",2,"flag: Serbia","rs"],
      ["🇷🇺",0.6,"flag: Russia","ru"],
      ["🇷🇼",2,"flag: Rwanda","rw"],
      ["🇸🇦",2,"flag: Saudi Arabia","sa"],
      ["🇸🇧",2,"flag: Solomon Islands","sb"],
      ["🇸🇨",2,"flag: Seychelles","sc"],
      ["🇸🇩",2,"flag: Sudan","sd"],
      ["🇸🇪",2,"flag: Sweden","se"],
      ["🇸🇬",2,"flag: Singapore","sg"],
      ["🇸🇭",2,"flag: St. Helena, Ascension & Tristan da Cunha","sh st"],
      ["🇸🇮",2,"flag: Slovenia","si"],
      ["🇸🇯",2,"flag: Svalbard & Jan Mayen","sj"],
      ["🇸🇰",2,"flag: Slovakia","sk"],
      ["🇸🇱",2,"flag: Sierra Leone","sl"],
      ["🇸🇲",2,"flag: San Marino","sm"],
      ["🇸🇳",2,"flag: Senegal","sn"],
      ["🇸🇴",2,"flag: Somalia","so"],
      ["🇸🇷",2,"flag: Suriname","sr"],
      ["🇸🇸",2,"flag: South Sudan","ss"],
      ["🇸🇹",2,"flag: São Tomé & Príncipe","st sao tome principe"],
      ["🇸🇻",2,"flag: El Salvador","sv"],
      ["🇸🇽",2,"flag: Sint Maarten","sx"],
      ["🇸🇾",2,"flag: Syria","sy"],
      ["🇸🇿",2,"flag: Eswatini","sz swaziland"],
      ["🇹🇦",2,"flag: Tristan da Cunha","ta"],
      ["🇹🇨",2,"flag: Turks & Caicos Islands","tc"],
      ["🇹🇩",2,"flag: Chad","td"],
      ["🇹🇫",2,"flag: French Southern and Antarctic Lands","tf territories"],
      ["🇹🇬",2,"flag: Togo","tg"],
      ["🇹🇭",2,"flag: Thailand","th"],
      ["🇹🇯",2,"flag: Tajikistan","tj"],
      ["🇹🇰",2,"flag: Tokelau","tk"],
      ["🇹🇱",2,"flag: Timor-Leste","tl timor leste"],
      ["🇹🇲",2,"flag: Turkmenistan","tm"],
      ["🇹🇳",2,"flag: Tunisia","tn"],
      ["🇹🇴",2,"flag: Tonga","to"],
      ["🇹🇷",2,"flag: Türkiye","tr"],
      ["🇹🇹",2,"flag: Trinidad & Tobago","tt"],
      ["🇹🇻",2,"flag: Tuvalu","tv"],
      ["🇹🇼",2,"flag: Taiwan","tw"],
      ["🇹🇿",2,"flag: Tanzania","tz"],
      ["🇺🇦",2,"flag: Ukraine","ua"],
      ["🇺🇬",2,"flag: Uganda","ug"],
      ["🇺🇲",2,"flag: U.S. Outlying Islands","um us"],
      ["🇺🇳",4,"flag: United Nations","un"],
      ["🇺🇸",0.6,"flag: United States","us"],
      ["🇺🇾",2,"flag: Uruguay","uy"],
      ["🇺🇿",2,"flag: Uzbekistan","uz"],
      ["🇻🇦",2,"flag: Vatican City","va"],
      ["🇻🇨",2,"flag: St. Vincent & Grenadines","vc st"],
      ["🇻🇪",2,"flag: Venezuela","ve"],
      ["🇻🇬",2,"flag: British Virgin Islands","vg"],
      ["🇻🇮",2,"flag: U.S. Virgin Islands","vi us"],
      ["🇻🇳",2,"flag: Vietnam","vn"],
      ["🇻🇺",2,"flag: Vanuatu","vu"],
      ["🇼🇫",2,"flag: Wallis & Futuna","wf"],
      ["🇼🇸",2,"flag: Samoa","ws"],
      ["🇽🇰",2,"flag: Kosovo","xk"],
      ["🇾🇪",2,"flag: Yemen","ye"],
      ["🇾🇹",2,"flag: Mayotte","yt"],
      ["🇿🇦",2,"flag: South Africa","za"],
      ["🇿🇲",2,"flag: Zambia","zm"],
      ["🇿🇼",2,"flag: Zimbabwe","zw"],
      ["🏴󠁧󠁢󠁥󠁮󠁧󠁿",5,"flag: England","gbeng"],
      ["🏴󠁧󠁢󠁳󠁣󠁴󠁿",5,"flag: Scotland","gbsct"],
      ["🏴󠁧󠁢󠁷󠁬󠁳󠁿",5,"flag: Wales","gbwls"],
    ];
  }
  // ---- END EMOJI DATA ----

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
