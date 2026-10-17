# Reveal: Work lifts away → lake → ring → Contact opens

The scroll hand-off from the reference site's "next page" footer, rebuilt for this portfolio.

## What happens
1. At the end of **Work** the section lifts away and uncovers the **night lake** (the 3D scene, ring and text removed).
2. "(Just Continue to reveal) / ring / [ next page ] / **Contact**" wipes in at the bottom of the screen.
3. Keep scrolling at the very bottom: the ring fills (700px of wheel; 200px on touch) and drains if you stop.
4. Ring full → the window opens to full screen (1s, power2.inOut) → the scene itself navigates lake → `/contact`
   (camera flies to the tree, the form appears) and the Contact page takes over the screen.

## Files
| file | job |
|---|---|
| `NextReveal.tsx` | layout + React state: `[panel][band][next]`, the overlay, the hand-off |
| `revealEngine.ts` | all the timing/maths (no React). **Every number is in `REVEAL` at the top**, taken from the reference build |
| `ProgressRing.tsx` | the ring (arc is driven by the engine, not React) |
| `reveal.module.css` | overlay + layout |
| `SmoothScroll.tsx`, `smooth.ts`, `smooth.css` | Lenis (lerp 0.08 like the reference). Remove `<SmoothScroll />` from `page.tsx` to use native scrolling; the reveal works with both |
| `../contact/Contact.tsx` | hosts the ONE scene iframe: fixed **behind** the page (lake), then the Contact page |
| `public/contact-scene/scene.html` | embed layer: `?start=lake` mode (see below) |

## How the lake works (scene.html, `?start=lake`)
- The scene boots on the engine's own home view ("/") instead of the form, in night mode.
- The purple particle ring (the engine's "figure") and all page text meshes are forced hidden while `lake.on`.
- It tells the page `lake-ready` once its intro is done. The page shows the iframe only then.
- On `open-contact` the scene shows its UI again and does the engine's own `/` → `/contact` navigation.
- Night mode: the lake is night because scene.html sets the scene's `theme=dark` cookie at boot (your existing code).
  Your dark -> light colour change is kept: on the form page it runs after the scene loads (as before); in lake mode it
  runs 2.4 s after the contact page is opened, and is kept (the scene re-applies dark once its route changes).

## Tuning
- Ring length / sensitivity: `REVEAL.threshold` / `thresholdTouch`.
- How far the window opens while the ring fills: `REVEAL.preview`.
- Open speed: `REVEAL.expandDuration`.
- Overlay text/size: `NextReveal.tsx` + `reveal.module.css`. Title is the `title` prop in `page.tsx`.

## Behaviour notes
- The Contact page is not in the scroll until the ring fires (otherwise normal scrolling would run past the reveal).
- A link to `#contact` anywhere on the page opens Contact directly (no ring). Same for
  `window.dispatchEvent(new Event('portfolio:open-contact'))`.
- Once opened, Contact stays open for the session (scrolling back up just slides Work back over it).
- While mounted, the page colour is carried by `<html>` instead of `<body>` (a body background would cover the
  iframe behind the page). It is restored on unmount.
- The scene starts loading ~3 screens before the end of Work.
