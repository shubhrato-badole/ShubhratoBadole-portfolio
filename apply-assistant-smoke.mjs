// Adds the cursor smoke (same code as the Intro and Work section) to the AI assistant takeover.
// Run from your project root:   node apply-assistant-smoke.mjs
// It changes only src/components/assistant/Assistant.tsx and assistant.module.css, and it changes NOTHING
// if any of the 5 insertion points can't be found (it tells you which one).
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'src/components/assistant';
const tsxPath = path.join(dir, 'Assistant.tsx');
const cssPath = path.join(dir, 'assistant.module.css');
for (const p of [tsxPath, cssPath]) if (!fs.existsSync(p)) { console.error('Not found: ' + p + '  (run this from the project root, or pass the assistant folder)'); process.exit(1); }

let tsx = fs.readFileSync(tsxPath, 'utf8');
let css = fs.readFileSync(cssPath, 'utf8');
if (tsx.includes('createFluidSmoke') && css.includes('.smoke')) { console.log('Already applied. Nothing to do.'); process.exit(0); }

const problems = [];
const nl = tsx.includes('\r\n') ? '\r\n' : '\n';
const edit = (label, re, make) => {
  const m = tsx.match(re);
  if (!m) { problems.push(label); return; }
  tsx = tsx.replace(re, (...a) => make(a[1] ?? ''));
};

// 1. import
edit('the "import styles from \'./assistant.module.css\'" line', /^(import styles from '\.\/assistant\.module\.css';)/m,
  (x) => `${x}${nl}import { createFluidSmoke } from '../work/smoke';`);

// 2. ref for the smoke canvas
edit('the "const threadRef = useRef" line', /^([ \t]*)const threadRef = useRef<HTMLDivElement>\(null\);/m,
  (ind) => `${ind}const threadRef = useRef<HTMLDivElement>(null);${nl}${ind}const smokeRef = useRef<HTMLCanvasElement>(null);`);

// 3. start / stop the smoke with the takeover
edit('the "keep the newest line in view" comment', /^([ \t]*)\/\* keep the newest line in view while text streams in \*\//m, (ind) => [
  `${ind}/* cursor smoke inside the takeover: the same smoke as the Intro and the Work section (../work/smoke.ts).`,
  `${ind}   Runs only while the assistant is open, and only with a mouse and motion allowed. */`,
  `${ind}useEffect(() => {`,
  `${ind}  if (!open || !finePointer() || reduceMotion()) return;`,
  `${ind}  const cv = smokeRef.current;`,
  `${ind}  if (!cv) return;`,
  `${ind}  const s = createFluidSmoke(cv, { scope: null });`,
  `${ind}  return () => s?.destroy();`,
  `${ind}}, [open, mounted]);`,
  ``,
  `${ind}/* keep the newest line in view while text streams in */`,
].join(nl));

// 4. the canvas, above the content (like the Work section), below the top buttons
edit('the "<span className={styles.srOnly}>" line', /^([ \t]*)<span className=\{styles\.srOnly\}>/m,
  (ind) => `${ind}<canvas ref={smokeRef} className={styles.smoke} aria-hidden="true" />${nl}${ind}<span className={styles.srOnly}>`);

if (problems.length) {
  console.error('Nothing was changed. I could not find: ' + problems.join('; '));
  console.error('Your file differs from the one I saw. Send me Assistant.tsx and I will adapt the script.');
  process.exit(1);
}

// 5. css
if (!css.includes('.smoke')) {
  css += `${nl}${nl}/* cursor smoke: a layer over the takeover's content (like the Work section), under the top buttons.${nl}   Blended with screen so it only lightens, never covers text. Mouse events pass straight through it. */${nl}.smoke {${nl}  position: absolute;${nl}  inset: 0;${nl}  width: 100%;${nl}  height: 100%;${nl}  z-index: 2;${nl}  pointer-events: none;${nl}  mix-blend-mode: screen;${nl}}${nl}`;
}

fs.writeFileSync(tsxPath, tsx);
fs.writeFileSync(cssPath, css);
console.log('Done: added the smoke to ' + tsxPath + ' and ' + cssPath);
