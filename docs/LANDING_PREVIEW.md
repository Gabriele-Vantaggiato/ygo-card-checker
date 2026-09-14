# Yu-Gi-Oh! cinematic landing

Branch: `refactor/05-cinematic-landing`, based on remote main `ab4377a`
plus the first landing commit `473d700`. The user authorized publication to
main after this redesign. GitHub integration writes last returned HTTP 403;
local completion does not imply a deployment.

The opening combines a rotating summoning portal, floating cards, holographic
highlights, pointer depth and Canvas 2D particles. Four scroll sequences stage
the deck, search, Flow Studio and overlay tools. A typographic interlude,
animated chapter navigation and moving finale connect the scenes.

Design research: [Lusion](https://lusion.co/) describes its work as interactive
3D storytelling; [Bruno Simon](https://bruno-simon.com/) presents an explorable
interactive world. These informed the immersive direction. Lusion's rendered
experience could not be inspected because the review browser lacked WebGL.
This implementation uses CSS transforms and Canvas 2D, with no new runtime
animation dependency.

All application links, Italian/English copy and workspace shortcuts retain
their real routes and stores. The motion controller runs outside Angular,
uses native scrolling and cancels listeners and animation frames on teardown.
Scenes pin only when their content fits the available height. Long content,
landscape phones and reduced-motion preferences retain normal document flow.
Decorative loops pause outside the viewport and when the document is hidden.
Users can pause motion for the session. Existing card artwork is served locally.

## Review preview

Run `node tools/preview/build-landing-preview.mjs /absolute/output-directory`.
The standalone `YGOCardChecker-Preview-Mobile.html` has phone and desktop review
modes, embeds card images, and uses the actual template, styles and controller.
The preview shell represents app navigation; tool links remain inside the
preview and identify themselves as preview links. It uses an empty workspace.
The lowercase output is a compact phone fragment. Neither file deploys the app.

## Verification

The production build passes with the existing initial bundle warning
(approximately 734 kB raw; the error threshold is 1 MB). Focused tests cover
scroll geometry, pin boundaries, content fit, frame coalescing, native scrolling,
pause, reduced motion, page visibility, unavailable storage and teardown.
The generator checks Angular substitutions, script syntax and its 1 MB limit.

Direct visual capture of local files is unavailable because the Cloud Browser
URL policy rejects local file navigation. No real-phone screenshot or deployed
preview verification is claimed.
