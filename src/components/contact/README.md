# Contact section

`Contact.tsx` hosts a finished scene (`public/contact-scene/scene.html`) in an iframe, as the
`#contact` section after Work. The scene is a compiled app made by Emotion Agency, so all of it
lives in ONE folder: `public/contact-scene/`. To replace it later (own fonts / models / scene), swap that folder.

Changes made to the scene files (everything else is untouched):
- All absolute paths moved under `/contact-scene/`.
- No sound: audio entries point to a silent built-in clip, the sound gate is skipped automatically.
- Original top bar + small-screen menu pill hidden (the portfolio has its own nav).
- File-attach button hidden (the form only builds a `mailto:` email, which can't carry files).
- Embed layer in `scene.html` (see the block marked "embed layer"): orb -> opens the assistant,
  links -> scroll the portfolio, wheel hand-off at the top / bottom of the form.

The form opens the visitor's email app (`mailto:bshubhrato@gmail.com`).
