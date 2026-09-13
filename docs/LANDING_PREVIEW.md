# Yu-Gi-Oh! landing · review before main

Branch: `refactor/04-parallax-landing`, based on the local Flow Studio work at
`664a26a`. The user requested a mobile preview and wants to approve it before
anything is pushed to `main`. This change has not been published.

The landing now follows four scroll-driven scenes: cards assembling over a
Deck Studio field, Dark Magician emerging from a spell circle, Flow Studio
branches lighting up, and an Overlay scan passing over Blue-Eyes White Dragon.
Each scene links to its actual application route. Italian and English copy,
workspace shortcuts and local data remain connected to the existing stores.

The motion controller runs outside Angular, batches geometry reads and CSS
writes into one animation frame per scroll update, and cancels its observers
and listeners when the route is destroyed. Scrolling stays native. Effects
respect reduced-motion settings and can be paused for the browser session.
Cards use the same three images as the previous landing, now served locally.
No new application dependency is required.

## Review preview

Run `node tools/preview/build-landing-preview.mjs /absolute/output-directory`.
This produces a 390 px interactive landing preview using the actual template,
stylesheet and motion controller. Card artwork is embedded once per image.
The app header and bottom navigation are represented for mobile context.
The preview uses an empty workspace example; tool links stay in the preview
and explicitly identify themselves as preview links. The Angular page itself
uses RouterLink and the user's real deck and Flow stores.

The standalone file is `YGOCardChecker-Preview-Mobile.html`. The lowercase
fragment is for inline review. Neither output deploys or changes the live app.

## Verification

- Production build passes; the pre-existing initial bundle warning remains
  (approximately 714 kB raw, below the 1 MB error threshold).
- Seven focused Karma tests pass for geometry, frame coalescing, native
  scrolling, pause, reduced motion, blocked storage and teardown.
- The preview generator validates template substitutions, script syntax and
  the 1 MB inline size limit.
- Direct visual capture of local files is unavailable in this session because
  the Cloud Browser URL policy rejects local file navigation. No screenshot
  of a real phone or deployed preview is claimed.

Push/merge/deployment must follow the user's approval of this preview.
