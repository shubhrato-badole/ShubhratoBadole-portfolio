'use client';

import ContactNative from './ContactNative';

/* The Contact section (see ContactNative.tsx). One implementation for every device: two pictures that move like a camera, a few
   living particles, and the panel with the form. No 3D engine, no iframe, no sound. */
export default function Contact() {
  return <ContactNative />;
}
