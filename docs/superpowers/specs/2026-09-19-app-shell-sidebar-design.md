# App shell: collapsible sidebar + profile avatar

Date: 2026-09-19

## Goal

Replace the overcrowded top navbar with a desktop collapsible sidebar and a standard profile avatar control, while keeping the mobile bottom tab bar.

## Decisions

- Desktop (`lg+`): click-to-expand sidebar (icon rail ↔ labels), pin state in `localStorage` (`ygo.sidebar.expanded`).
- Top bar: format + language + avatar dropdown only (brand lives in sidebar on desktop).
- Profile desktop: circle avatar → dropdown (email, Profilo, Logout); guest → Login.
- Mobile: keep bottom tabs; top-bar circle → `/profile` when logged in, Login when guest.
- Visual language: existing `duel` theme (obsidian + antique gold). No new color system.

## Out of scope

- Reworking page content layouts beyond shell chrome.
- Changing route structure.
