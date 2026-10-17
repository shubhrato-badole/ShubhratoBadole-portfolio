import type { Ref } from 'react';
import styles from './reveal.module.css';

const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/* Same ring as the reference: a 6rem circle, a 2px track, a round-capped arc (driven by the reveal engine through
   `barRef`, so it never re-renders React) and the corner-arrow icon in the middle. */
export default function ProgressRing({ barRef }: { barRef?: Ref<SVGCircleElement> }) {
  return (
    <div className={styles.ring}>
      <svg className={styles.ringSvg} viewBox="0 0 100 100" aria-hidden>
        <circle className={styles.ringTrack} cx="50" cy="50" r={RADIUS} />
        <circle
          ref={barRef}
          className={styles.ringBar}
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
        />
      </svg>
      <svg
        className={styles.ringIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m10 15 5 5 5-5" />
        <path d="M4 4h7a4 4 0 0 1 4 4v12" />
      </svg>
    </div>
  );
}
