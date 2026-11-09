# 💬 MaM Shoutbox Modern Redesign

![Version](https://img.shields.io/badge/version-1.3.0-4475e9) ![Licence: MIT](https://img.shields.io/badge/licence-MIT-green)

A clean, modern dark chat view for the MaM shoutbox.

**[Install userscript](https://raw.githubusercontent.com/KAH-Rhyme/mam-shoutbox-modern-redesign/main/mam-shoutbox-modern-redesign.user.js)** · [Report a problem](https://github.com/KAH-Rhyme/mam-shoutbox-modern-redesign/issues)

This userscript restyles the shoutbox into a modern chat layout: neat columns for time, name and message, replies shown above the shout they answer, and readable name colours. It only changes how the shoutbox looks and behaves in your own browser. Shouts are still sent by MaM's own controls, and the script makes no network requests of its own.

It also adds click-to-jump replies, highlights for your name, and a touch-friendly full-screen mode for phones. Everything can be switched on or off from a Settings button in the shoutbox.

Screenshots are in the script's thread on the MaM forums.

## Installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).
2. Click **[Install userscript](https://raw.githubusercontent.com/KAH-Rhyme/mam-shoutbox-modern-redesign/main/mam-shoutbox-modern-redesign.user.js)** and confirm in your userscript manager.

No special permissions are needed (`@grant none`). Updates install automatically through your userscript manager.

Works on current Chrome, Edge, Firefox and Safari. Mobile view has been tested on Android; iPhone feedback is very welcome.

> [!WARNING]
> **Custom CSS isn't supported.** If you use custom CSS on your MaM account (Preferences → Style), especially CSS that changes the shoutbox, it may clash with this script and make things look wrong, particularly in Mobile view. If something looks broken, try removing your custom CSS before reporting a problem.

## ✨ Features

- **Modern layout:** time, name and message sit in tidy columns. The @ / quote / ⋮ buttons stay hidden until you hover over a shout, and they never cover the text.
- **Clickable replies:** quotes are shown as a reply line above the shout. Click it to jump to the original shout, which briefly lights up.
- **Highlights:** shouts that mention your username (or any words you choose) get a red tint, including replies to you.
- **Emoji picker:** a ☺ button next to **Shout** opens a searchable list of emoji, with skin tones. Search by name or keyword ("happy", "thumbs"), use the arrow keys and Enter, and Shift-click or Shift+Enter to add several. It only lists emoji your device can show, and everything it needs is built into the script, so it loads nothing.
- **Smilies picker:** a **SMILIES** button next to the emoji button opens a searchable grid of MaM's smilies, in place of the Smilies tab. Search any part of a code ("love" finds `:love073:`), use the arrow keys and Enter, and Shift-click or Shift+Enter to add several. The spaces MaM needs around a smilie are added for you. It shows MaM's own smilie images, the same ones the Smilies tab uses. Turn it off in Settings to get the Smilies tab back.
- **Tidy suggestions:** typing `@name` or `:smilie` shows MaM's suggestions in a compact list just above the message box (or edit box), kept inside the shoutbox. Smilies are shown at a readable size next to their code, and names are in their class colour when they have a shout on screen.
- **Readable names:**
  - Name colours that are hard to read on a dark background are adjusted only as much as needed, so they stay close to the original.
  - Hover over a name to see it in full with the member's rank.
  - Your own name is shown at the start of the message box, in your class colour.
- **Easier reading:**
  - Optional shading on every other shout (adjustable strength) and an outline on the shout under the mouse.
  - Dates shown as "Today" / "Yesterday", and times without seconds (the full time is in the tooltip).
  - On desktop, the shoutbox grows to fit your browser window.
- **Keeps your place:** *Load Older* no longer throws you to the top. You stay on the shout you were reading, with a line marking where the older shouts begin. Leaving full screen puts you back where you were on the page. Once you've scrolled away from the newest shouts, a **Latest** button in the corner nearest them takes you straight back.
- **Full screen:** press <kbd>Esc</kbd> to leave MaM's full-screen shoutbox.
- **Mobile view (phones and tablets):**
  - A *📱 Mobile view* button opens the shoutbox full screen with a touch-friendly layout: larger text, name and time above each message, and a message box that stays above the on-screen keyboard.
  - Tap a shout to show its @ / quote / ⋮ buttons, and tap a time to see it in full.
  - If you pinch-zoom in by mistake, a *Reset zoom* button brings you back.
  - The normal page is fitted to your screen when it loads.
- **Works with your MaM settings:** supports newest-at-top or newest-at-bottom order, country flags on or off, and the message box at the top or bottom.

## ⚙️ Settings

Click **⚙ Settings** at the right of the shoutbox tab bar. Settings are saved in your browser and apply straight away.

| Section | Options |
| --- | --- |
| **Messages** | Fit to window height (desktop only), mark where older shouts were loaded, hide seconds, "Today" / "Yesterday" dates, shade every other shout (with strength slider), outline the shout under the mouse. |
| **Names** | Country flags (also needs flags on in your MaM preferences), rank and donor icons, fix hard-to-read name colours, keep coloured backgrounds behind names, name column width. |
| **Message Box & Full Screen** | Show your name in the box, emoji button, smilies button (replaces the Smilies tab), Esc leaves full screen, Mobile view (on touch screens / always / never). |
| **Highlights** | Words that highlight a shout. Your username is added for you, and you can remove it. |

## Reporting problems

[Open an issue](https://github.com/KAH-Rhyme/mam-shoutbox-modern-redesign/issues) or post in the script's thread on the MaM forums.

For layout problems, use **Settings → Copy diagnostics**. It collects details about how the page is styling the shoutbox. Paste that into your report along with a description or screenshot.

If anything gets stuck repeating, the script pauses that feature and shows a notice instead of freezing the page.

## Development

The emoji list in the script is generated from [emojibase-data](https://emojibase.dev). To rebuild it (for example after a new Unicode emoji release, by changing the version in `package.json`):

```sh
npm install
npm run build:emoji
```

This only rewrites the block between the `BEGIN EMOJI DATA` / `END EMOJI DATA` markers. Nothing in `package.json` or `tools/` ships with the userscript.

## Credits

- Theme colours, palette and general UI feel are based on thchat (MIT, © tetrahydroc and contributors).
- Emoji names and search words come from [emojibase](https://emojibase.dev) (MIT, © Miles Johnson), based on [Unicode CLDR](https://cldr.unicode.org) data (© Unicode, Inc., Unicode License v3). The full notices are in the script, above the emoji list.

> [!NOTE]
> **AI disclaimer:** AI was used significantly during development.

## Licence

[MIT](LICENCE)
