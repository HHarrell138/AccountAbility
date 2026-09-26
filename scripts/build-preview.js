'use strict';

// Bundles the app plus the in-browser fake backend (public/demo.js) into one
// self-contained HTML file: dist/preview.html. Open it on a phone to click
// around with a simulated partner, no server needed.

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// Keep inlined scripts from closing the <script> tag early.
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const icon = 'data:image/svg+xml;base64,' + Buffer.from(read('public/icon.svg')).toString('base64');
const app = read('public/app.js').replaceAll('"/icon.svg"', `"${icon}"`);

const html = `<title>AccountAbility</title>
<meta name="description" content="Habits you keep because someone's counting on you.">
<style>
${read('public/styles.css')}
.preview-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 560px;
  margin: 0 auto;
  padding: 10px 16px 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.preview-bar strong { color: var(--ink); }
</style>
<div class="preview-bar">
  <span><strong>Preview.</strong> Jake is simulated. Your taps are saved on this phone only.</span>
  <button class="btn small" id="preview-reset" type="button">Reset</button>
</div>
<main id="app" aria-live="polite"></main>
<div id="toast" role="status" hidden></div>
<script>(function () {
${safe(read('src/logic.js'))}
})();</script>
<script>
${safe(read('public/demo.js'))}
document.getElementById('preview-reset').addEventListener('click', function () {
  window.AA_DEMO_RESET();
  location.reload();
});
</script>
<script>
${safe(app)}
</script>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'preview.html'), html);
console.log(`Wrote dist/preview.html (${(html.length / 1024).toFixed(0)} KB)`);
