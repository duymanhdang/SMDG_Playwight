/**
 * shared.js — loaded by every page. Injects the sidebar shell (from
 * partials/shell.html) into a `<div id="shell-slot"></div>` placeholder,
 * then wires up theme toggling, keyboard shortcuts, the quick launcher
 * modal (⌘K / ⌘N), toast notifications, and the target-environment ping
 * indicator in the sidebar footer.
 *
 * Zero build step: this is plain injected HTML/JS, no bundler involved.
 */

const $ = (id) => document.getElementById(id);

// ── Theme (shared localStorage key across all pages) ──────────────────
function shellInitTheme() {
  // §7.1 — control-room design language is dark-by-default; a first-time
  // visitor with no saved preference gets the dark palette.
  shellApplyTheme(localStorage.getItem('mdg-theme') || 'dark');
}
function shellApplyTheme(theme) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  localStorage.setItem('mdg-theme', theme);
  const icon  = $('shellThemeIcon');
  const label = $('shellThemeLabel');
  if (icon) {
    icon.innerHTML = isDark
      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
  if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
  // v1.8.0 part 2 — pages with theme-dependent Chart.js instances (which
  // read colors from computed CSS custom properties at draw time, not via
  // CSS cascade) need a hook to know "the theme just changed, re-render".
  // Dispatched on every apply (including the initial boot call), so a
  // listener added after boot can simply always re-render on this event.
  document.dispatchEvent(new CustomEvent('mdg:themechange', { detail: { theme, isDark } }));
}
function shellToggleTheme() {
  shellApplyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
}

// ── Density mode (v1.5.0 item 4 — Comfortable / Compact) ───────────────
// Mirrors the theme-persistence pattern exactly (same localStorage
// approach, same "apply on boot + apply again once the shell's DOM nodes
// exist" two-call pattern as shellInitTheme/shellApplyTheme above).
function shellInitDensity() {
  shellApplyDensity(localStorage.getItem('mdg-density') || 'comfortable');
}
function shellApplyDensity(density) {
  const isCompact = density === 'compact';
  document.documentElement.setAttribute('data-density', isCompact ? 'compact' : 'comfortable');
  localStorage.setItem('mdg-density', isCompact ? 'compact' : 'comfortable');
  const label = $('shellDensityLabel');
  if (label) label.textContent = isCompact ? 'Comfortable view' : 'Compact view';
}
function shellToggleDensity() {
  const isCompact = document.documentElement.getAttribute('data-density') === 'compact';
  shellApplyDensity(isCompact ? 'comfortable' : 'compact');
}

// ── Toasts ──────────────────────────────────────────────────────────
function showToast(msg) {
  const stack = $('toastStack');
  if (!stack) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

// ── Environment ping (sidebar footer) ──────────────────────────────
async function shellLoadEnvironment() {
  try {
    const data = await fetch('/api/environment/ping').then((r) => r.json());
    const dot    = $('sidebarEnvDot');
    const name   = $('sidebarEnvName');
    const status = $('sidebarEnvStatus');
    if (!dot) return;
    if (!data.targetUrl) {
      dot.className = 'dot';
      name.textContent = 'No target set';
      status.textContent = 'Configure in Settings';
      return;
    }
    name.textContent = data.hostname || data.targetUrl;
    if (data.ok) {
      dot.className = 'dot up';
      status.textContent = `Online · ${data.responseTimeMs}ms`;
    } else {
      dot.className = 'dot down';
      status.textContent = data.error ? 'Unreachable' : 'Offline';
    }
  } catch (_) {
    /* Environment ping is a nice-to-have — never break the page over it. */
  }
}

// ── View Last Report shortcut ──────────────────────────────────────
async function shellViewLastReport() {
  try {
    const data = await fetch('/api/show-report', { method: 'POST' }).then((r) => r.json());
    if (!data.ok) throw new Error(data.error);
    // §5.1 — the server no longer opens a detached PowerShell/browser window
    // itself (that required cmd.exe + shell:true); it just returns a report
    // URL, which the browser opens client-side instead. §v1.8.1 — that URL
    // now normally points at Playwright's own show-report server (started
    // on-demand server-side) rather than a plain static mount, so
    // screenshots/videos/traces resolve correctly; `data.degraded` signals
    // the old static fallback was used instead (Playwright CLI missing, port
    // exhaustion, etc.) and some attachments may not display.
    window.open(data.url, '_blank');
    showToast(data.degraded ? ('⚠ ' + data.warning) : 'Opening latest report…');
  } catch (err) {
    showToast('⚠ ' + err.message);
  }
}

// ── Quick launcher (⌘K / ⌘N) ───────────────────────────────────────
// v1.5.0 item 3 expanded this from "run a suite" only into a small
// prefix-driven multi-mode palette (still no fuzzy-matching library — plain
// substring match, same as the original suite filter):
//   (no prefix)  run a suite               — original v1.3.0 behavior
//   >            jump to a nav page
//   #            open a past run by id/label
//   !            quarantine a test by title (governance-gated — see below)
// Each mode's data is only fetched the first time that mode is entered.
let launcherSuites = [];
let launcherRuns = null;        // lazy-loaded recent run history (capped, not full history)
let launcherQuarantineCandidates = null; // lazy-loaded flaky-test list (quarantine candidates)
let launcherHiIndex = 0;

const LAUNCHER_NAV_PAGES = [
  { label: 'Overview',         href: '/overview.html' },
  { label: 'Test Explorer',    href: '/explorer.html' },
  { label: 'Execution Center', href: '/execution-center.html' },
  { label: 'Results',          href: '/results.html' },
  { label: 'Compare',          href: '/compare.html' },
  { label: 'Insights',         href: '/insights.html' },
  { label: 'Report Center',    href: '/report-center.html' },
  { label: 'Readiness & Coverage', href: '/readiness.html' },
  { label: 'Triage Board',     href: '/triage-board.html' },
  { label: 'AI Workspace',     href: '/ai-workspace.html' },
  { label: 'Settings',         href: '/settings.html' },
  { label: 'About',            href: '/about.html' },
];

function launcherMode(rawInput) {
  if (rawInput.startsWith('>')) return 'nav';
  if (rawInput.startsWith('#')) return 'run';
  if (rawInput.startsWith('!')) return 'quarantine';
  return 'suite';
}
function launcherQueryText(rawInput, mode) {
  return mode === 'suite' ? rawInput : rawInput.slice(1);
}

function openLauncher() {
  $('launcherBackdrop').classList.add('open');
  $('launcherInput').value = '';
  $('launcherInput').focus();
  if (!launcherSuites.length) loadLauncherSuites();
  else renderLauncherList();
}
function closeLauncher() {
  $('launcherBackdrop').classList.remove('open');
}
async function loadLauncherSuites() {
  try {
    const data = await fetch('/api/suites').then((r) => r.json());
    if (data.ok) launcherSuites = data.suites;
    renderLauncherList();
  } catch (_) {
    renderLauncherList();
  }
}
async function loadLauncherRuns() {
  try {
    // Capped, recent-only — deliberately not the full run history (§ task
    // brief: "don't load full history into the palette").
    const data = await fetch('/api/runs/history?limit=40').then((r) => r.json());
    launcherRuns = data.ok ? data.runs : [];
  } catch (_) {
    launcherRuns = [];
  }
  renderLauncherList();
}
async function loadLauncherQuarantineCandidates() {
  try {
    // Reuses the flaky-tests dataset (already the natural quarantine
    // candidate pool — insights.html's "Quarantine" button acts on the same
    // list) rather than adding a new "list every test" endpoint just for
    // the palette.
    const data = await fetch('/api/flaky?days=90').then((r) => r.json());
    launcherQuarantineCandidates = data.ok ? data.tests : [];
  } catch (_) {
    launcherQuarantineCandidates = [];
  }
  renderLauncherList();
}

function renderLauncherList() {
  const raw = $('launcherInput').value || '';
  const mode = launcherMode(raw);
  const q = launcherQueryText(raw, mode).toLowerCase();
  const list = $('launcherList');
  const hint = $('launcherHint');

  if (mode === 'nav') {
    if (hint) hint.textContent = '↑↓ navigate · ↵ open page · esc close';
    const filtered = LAUNCHER_NAV_PAGES.filter((p) => p.label.toLowerCase().includes(q));
    launcherHiIndex = 0;
    if (!filtered.length) { list.innerHTML = '<div class="empty">No matching page</div>'; return; }
    list.innerHTML = filtered.map((p, i) => `
      <div class="launcher-item ${i === 0 ? 'hi' : ''}" data-action="nav" data-href="${p.href}" onclick="launcherGoToPage('${p.href}')">
        <div class="launcher-item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
        <div><div class="launcher-item-title">${p.label}</div><div class="launcher-item-sub">Jump to page</div></div>
      </div>`).join('');
    return;
  }

  if (mode === 'run') {
    if (hint) hint.textContent = '↑↓ navigate · ↵ open run · esc close';
    if (launcherRuns === null) { list.innerHTML = '<div class="empty">Loading recent runs…</div>'; loadLauncherRuns(); return; }
    const filtered = launcherRuns.filter((r) => {
      const label = (r.label || r.id || '').toLowerCase();
      return label.includes(q) || (r.id || '').toLowerCase().includes(q);
    });
    launcherHiIndex = 0;
    if (!filtered.length) { list.innerHTML = '<div class="empty">No matching run</div>'; return; }
    list.innerHTML = filtered.slice(0, 20).map((r, i) => {
      const label = (r.label || r.id).replace(/^\[(SUITE|SPEC)\]\s*/, '');
      return `
      <div class="launcher-item ${i === 0 ? 'hi' : ''}" data-action="run" data-runid="${r.id}" onclick="launcherOpenRun('${r.id}')">
        <div class="launcher-item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg></div>
        <div><div class="launcher-item-title">${escapeHtmlLauncher(label)}</div><div class="launcher-item-sub">${r.status} · ${r.passed || 0}✓ ${r.failed || 0}✗</div></div>
      </div>`;
    }).join('');
    return;
  }

  if (mode === 'quarantine') {
    if (hint) hint.textContent = '↑↓ navigate · ↵ quarantine (asks reason/name) · esc close';
    if (launcherQuarantineCandidates === null) { list.innerHTML = '<div class="empty">Loading tests…</div>'; loadLauncherQuarantineCandidates(); return; }
    const filtered = launcherQuarantineCandidates.filter((t) => t.title.toLowerCase().includes(q));
    launcherHiIndex = 0;
    if (!filtered.length) { list.innerHTML = '<div class="empty">No matching flaky test</div>'; return; }
    list.innerHTML = filtered.slice(0, 20).map((t, i) => `
      <div class="launcher-item ${i === 0 ? 'hi' : ''}" data-action="quarantine" data-suite="${t.suiteName}" data-title="${escapeAttrLauncher(t.title)}" onclick="launcherQuarantineTest('${t.suiteName}', this.dataset.title)">
        <div class="launcher-item-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg></div>
        <div><div class="launcher-item-title">${escapeHtmlLauncher(t.title)}</div><div class="launcher-item-sub">${t.suiteName} · ${t.failureRate}% failure rate${t.quarantined ? ' · already quarantined' : ''}</div></div>
      </div>`).join('');
    return;
  }

  // mode === 'suite' (original behavior)
  if (hint) hint.textContent = '↑↓ navigate · ↵ run entire suite · esc close';
  const filtered = launcherSuites.filter((s) => s.name.toLowerCase().includes(q));
  launcherHiIndex = 0;
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No matching suite</div>';
    return;
  }
  list.innerHTML = filtered.map((s, i) => `
    <div class="launcher-item ${i === 0 ? 'hi' : ''}" data-action="suite" data-suite="${s.id}" onclick="launcherRunSuite('${s.id}')">
      <div class="launcher-item-icon">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div>
        <div class="launcher-item-title">${s.short}</div>
        <div class="launcher-item-sub">${s.specs.length} specs · run entire suite</div>
      </div>
    </div>`).join('');
}
function escapeHtmlLauncher(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttrLauncher(str) { return escapeHtmlLauncher(str); }

function launcherMove(delta) {
  const items = Array.from(document.querySelectorAll('.launcher-item'));
  if (!items.length) return;
  items[launcherHiIndex]?.classList.remove('hi');
  launcherHiIndex = (launcherHiIndex + delta + items.length) % items.length;
  items[launcherHiIndex].classList.add('hi');
  items[launcherHiIndex].scrollIntoView({ block: 'nearest' });
}
function launcherActivateHighlighted() {
  const hi = document.querySelector('.launcher-item.hi');
  if (!hi) return;
  const action = hi.dataset.action;
  if (action === 'nav') launcherGoToPage(hi.dataset.href);
  else if (action === 'run') launcherOpenRun(hi.dataset.runid);
  else if (action === 'quarantine') launcherQuarantineTest(hi.dataset.suite, hi.dataset.title);
  else launcherRunSuite(hi.dataset.suite);
}
function launcherGoToPage(href) {
  closeLauncher();
  location.href = href;
}
function launcherOpenRun(runId) {
  closeLauncher();
  location.href = `/results.html?id=${encodeURIComponent(runId)}`;
}
async function launcherQuarantineTest(suiteName, title) {
  closeLauncher();
  // §F3 governance rule (v1.0) — quarantine always requires reason +
  // requestedBy. The palette is a fast way to REACH this action, not a way
  // to bypass its validation, so it reuses the exact same prompt flow as
  // insights.html's toggleQuarantine().
  const reason = prompt(`Reason for quarantining "${title}" (required):`);
  if (!reason || !reason.trim()) return;
  const requestedBy = prompt('Your name (required):');
  if (!requestedBy || !requestedBy.trim()) return;
  const expiresInDays = prompt('Expires in how many days? (1-60, default 14)', '14');
  try {
    const data = await fetch('/api/flaky/quarantine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suiteName, title, reason, requestedBy, expiresInDays: expiresInDays ? Number(expiresInDays) : undefined }),
    }).then((r) => r.json());
    if (!data.ok) throw new Error(data.error);
    launcherQuarantineCandidates = null; // stale now — refetch next time this mode opens
    showToast(`Quarantined: ${title}`);
  } catch (err) {
    showToast('⚠ ' + err.message);
  }
}
async function launcherRunSuite(suiteId) {
  closeLauncher();
  try {
    const data = await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'suite', suiteName: suiteId, workers: 2 }),
    }).then((r) => r.json());
    if (!data.ok) {
      // §v1.3.0 item 2 — surface a blocking pre-flight check's message.
      if (data.preflight && data.preflight.checks) {
        const blocking = data.preflight.checks.filter((c) => c.status === 'block');
        throw new Error(blocking.map((c) => c.message).join(' ') || data.error);
      }
      throw new Error(data.error);
    }
    if (data.preflight && data.preflight.checks) {
      data.preflight.checks.filter((c) => c.status === 'warn').forEach((c) => showToast('⚠ ' + c.message));
    }
    showToast(`Started: ${data.label}`);
  } catch (err) {
    showToast('⚠ ' + err.message);
  }
}

// ── Keyboard shortcuts (global) ────────────────────────────────────
function shellHandleKeydown(e) {
  const inLauncher = $('launcherBackdrop') && $('launcherBackdrop').classList.contains('open');
  const meta = e.metaKey || e.ctrlKey;

  if (meta && (e.key === 'k' || e.key === 'n')) {
    e.preventDefault();
    inLauncher ? closeLauncher() : openLauncher();
    return;
  }
  if (inLauncher) {
    if (e.key === 'Escape') { e.preventDefault(); closeLauncher(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); launcherMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); launcherMove(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      launcherActivateHighlighted();
    }
    return;
  }
  // Only fire the numbered shortcuts with a modifier key, to avoid hijacking
  // normal typing in search boxes elsewhere on the page.
  if (meta && e.key === '1') { e.preventDefault(); location.href = '/execution-center.html'; }
  if (meta && e.key === '2') { e.preventDefault(); location.href = '/explorer.html'; }
  if (meta && e.key === '3') { e.preventDefault(); shellViewLastReport(); }
  if (meta && e.key === '4') { e.preventDefault(); location.href = '/insights.html'; }
}

// ── Footer version (§3 — "Built by Alain Truong" + dashboardVersion) ──
async function shellLoadVersion() {
  try {
    const data = await fetch('/api/meta').then((r) => r.json());
    const el = $('sidebarVersion');
    if (el && data && data.dashboardVersion) el.textContent = `v${data.dashboardVersion}`;
  } catch (_) {
    /* footer version is cosmetic only — never break the page over it */
  }
}

// ── EventLog Bot — floating chat widget (SAP MDG CR event-log lookup) ─
// Mounted globally from initShell() below, so it appears on every page
// without any of the 14 existing HTML pages needing to change.
let eventlogBotSettings = null;
let eventlogBotOpen = false;

function eventlogBotEscapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Auto Bot mascot — a cute inline-SVG capybara (prototyped standalone, then
// wired in here), drawn with the --capy-* color tokens (shared.css) instead
// of currentColor since it's a multi-tone character, not a single-color
// icon. `.capy-character`/`.capy-head-group`/`.capy-wave`/`.capy-eyelids`
// are the hooks the FAB's breathing/blink/tilt/wave/squish animations
// (shared.css, scoped to .eventlog-bot-fab) attach to. Also injected once
// into the chat panel's header icon slot (mountEventlogBot below) — the
// demo's chat window has a single mascot icon in the header, not one per
// message, so the chat log itself is plain aligned bubbles (eventlogBotWrapMessage).
const EVENTLOG_BOT_MASCOT_SVG = `<svg viewBox="0 0 100 100">
  <g class="capy-character">
    <ellipse cx="50" cy="66" rx="30" ry="20" fill="var(--capy-body)"/>
    <ellipse cx="50" cy="72" rx="22" ry="11" fill="var(--capy-belly)"/>
    <ellipse cx="34" cy="78" rx="6" ry="5" fill="var(--capy-body-shade)"/>
    <ellipse class="capy-wave" cx="66" cy="78" rx="6" ry="5" fill="var(--capy-body-shade)"/>
    <g class="capy-head-group">
      <circle cx="27" cy="34" r="7" fill="var(--capy-body-shade)"/>
      <circle cx="73" cy="34" r="7" fill="var(--capy-body-shade)"/>
      <circle cx="27" cy="34" r="3.4" fill="var(--capy-belly)"/>
      <circle cx="73" cy="34" r="3.4" fill="var(--capy-belly)"/>
      <rect x="20" y="28" width="60" height="42" rx="21" fill="var(--capy-body)"/>
      <rect x="28" y="46" width="44" height="26" rx="13" fill="var(--capy-belly)"/>
      <circle cx="39" cy="50" r="3.6" fill="var(--capy-dark)"/>
      <circle cx="61" cy="50" r="3.6" fill="var(--capy-dark)"/>
      <rect class="capy-eyelids" x="35" y="46.5" width="8" height="7" rx="3.5" fill="var(--capy-body)"/>
      <rect class="capy-eyelids" x="57" y="46.5" width="8" height="7" rx="3.5" fill="var(--capy-body)"/>
      <ellipse cx="50" cy="60" rx="4.5" ry="3" fill="var(--capy-dark)"/>
      <path d="M 43 66 Q 50 70 57 66" stroke="var(--capy-dark)" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

// Every bot/user message goes through here so bubble markup stays
// consistent across greetings, chitchat, CR results (single and batch), and
// errors — callers only ever hand over the inner content. `extraClasses`
// lands on the bubble itself (e.g. "is-error" for a red-tinted error bubble,
// "tech-hidden eventlog-bot-toggle-scope" for a collapsible CR result).
function eventlogBotWrapMessage(role, innerHtml, extraClasses = '', rowId = '') {
  const idAttr = rowId ? ` id="${rowId}"` : '';
  if (role === 'user') {
    return `<div class="eventlog-bot-row user"${idAttr}><div class="eventlog-bot-msg user">${innerHtml}</div></div>`;
  }
  return `<div class="eventlog-bot-row bot"${idAttr}><div class="eventlog-bot-msg bot${extraClasses ? ' ' + extraClasses : ''}">${innerHtml}</div></div>`;
}
function eventlogBotTypingHtml(rowId) {
  return eventlogBotWrapMessage('bot', '<div class="eventlog-bot-typing"><span></span><span></span><span></span></div>', '', rowId);
}

function eventlogBotShowGreeting() {
  const body = $('eventlogBotBody');
  if (!body) return;
  const greeting = 'Hi! I\'m Capybara 🦫 — I can look up a CR (e.g. "check CR0000029831") or tell you about this dashboard\'s test results (e.g. "how\'s QA doing this week?"). What can I help with?';
  body.innerHTML = eventlogBotWrapMessage('bot', eventlogBotEscapeHtml(greeting), 'plain-text');
  body.dataset.greeted = '1';
}

function eventlogBotSendChip(text) {
  const input = $('eventlogBotInput');
  if (!input) return;
  input.value = text;
  sendEventlogBotQuery();
}

function eventlogBotClearChat() {
  const body = $('eventlogBotBody');
  if (!body) return;
  delete body.dataset.greeted;
  eventlogBotShowGreeting();
}

async function mountEventlogBot() {
  const toggle = $('eventlogBotToggle');
  if (!toggle) return;
  try {
    const data = await fetch('/api/settings').then((r) => r.json());
    eventlogBotSettings = data.ok ? data.settings : null;
  } catch (_) {
    eventlogBotSettings = null;
  }
  toggle.innerHTML = EVENTLOG_BOT_MASCOT_SVG;
  const headerIcon = $('eventlogBotHeaderIcon');
  if (headerIcon) headerIcon.innerHTML = EVENTLOG_BOT_MASCOT_SVG;
  toggle.style.display = 'flex';
  const input = $('eventlogBotInput');
  if (input) {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendEventlogBotQuery(); });
  }

  // Persist the user's preferred panel size (native CSS `resize: both` handle)
  // across pages/reloads, same localStorage pattern as the theme/density toggles.
  const panel = $('eventlogBotPanel');
  if (panel) {
    try {
      const saved = JSON.parse(localStorage.getItem('mdg-eventlogbot-size') || 'null');
      if (saved && saved.width && saved.height) {
        panel.style.width = saved.width;
        panel.style.height = saved.height;
      }
    } catch (_) { /* ignore malformed/missing saved size */ }
    let resizeSaveTimer = null;
    new ResizeObserver(() => {
      clearTimeout(resizeSaveTimer);
      resizeSaveTimer = setTimeout(() => {
        localStorage.setItem('mdg-eventlogbot-size', JSON.stringify({ width: panel.style.width, height: panel.style.height }));
      }, 300);
    }).observe(panel);
  }
}

function eventlogBotSquishFab() {
  const character = document.querySelector('#eventlogBotToggle .capy-character');
  if (!character) return;
  character.classList.remove('capy-squish');
  void character.offsetWidth; // force reflow so the animation restarts on rapid re-clicks
  character.classList.add('capy-squish');
}

function toggleEventlogBotPanel() {
  eventlogBotSquishFab();
  eventlogBotOpen = !eventlogBotOpen;
  const panel = $('eventlogBotPanel');
  if (!panel) return;
  panel.classList.toggle('hidden', !eventlogBotOpen);
  if (!eventlogBotOpen) return;

  const missing = [];
  if (!eventlogBotSettings) missing.push('could not load settings');
  else {
    if (!eventlogBotSettings.eventlogBotEnabled) missing.push('the "Enable EventLog Bot" toggle is off');
    if (!eventlogBotSettings.sapCookieSet) missing.push('no SAP cookie is saved');
    if (!eventlogBotSettings.sapBaseUrl) missing.push('no SAP base URL is saved');
    if (!eventlogBotSettings.aiEnabled || !eventlogBotSettings.aiKeySet) missing.push('AI Diagnosis (Groq key) is not enabled');
  }
  if (missing.length) {
    $('eventlogBotBody').innerHTML = `<div class="eventlog-bot-disabled">Capybara isn't ready yet: ${eventlogBotEscapeHtml(missing.join('; '))}. Fix this on <a href="/settings.html">Settings</a>.</div>`;
    $('eventlogBotInputRow').style.display = 'none';
    return;
  }
  $('eventlogBotInputRow').style.display = 'flex';
  if (!$('eventlogBotBody').dataset.greeted) {
    eventlogBotShowGreeting();
  }
}

const EVENTLOG_BOT_MAX_CRS = 3;
const EVENTLOG_BOT_STAGE_LABELS_VI = {
  submit: 'Giai đoạn Submit', approve: 'Giai đoạn Approve',
  activate: 'Giai đoạn Activate', requestAction: 'Nhật ký hành động (RequestAction)',
};
const EVENTLOG_BOT_STATUS_LABELS_VI = { PASSED: 'Đạt', FAILED: 'Lỗi', BYPASS: 'Bỏ qua (bypass)' };
const EVENTLOG_BOT_SECTION_LABELS = {
  vi: { overview: 'TỔNG QUAN', timeline: 'TIMELINE', errors: 'LỖI', recommendation: 'ĐỀ XUẤT' },
  en: { overview: 'OVERVIEW', timeline: 'TIMELINE', errors: 'ERRORS', recommendation: 'RECOMMENDATION' },
};

function eventlogBotStageLabel(stage, lang) {
  if (lang === 'vi' && EVENTLOG_BOT_STAGE_LABELS_VI[stage.entity]) return EVENTLOG_BOT_STAGE_LABELS_VI[stage.entity];
  return `${stage.label}EventLog`;
}
function eventlogBotStatusLabel(status, lang) {
  const s = (status || '-').toUpperCase();
  if (lang === 'vi' && EVENTLOG_BOT_STATUS_LABELS_VI[s]) return `${EVENTLOG_BOT_STATUS_LABELS_VI[s]} (${s})`;
  return s;
}

function eventlogBotRenderStage(stage, lang) {
  const title = eventlogBotStageLabel(stage, lang);
  if (!stage.ok) {
    return `<div class="eventlog-bot-stage"><div class="eventlog-bot-stage-title">${title} — ⚠ ${eventlogBotEscapeHtml(stage.message || (lang === 'vi' ? 'không lấy được dữ liệu' : 'fetch failed'))}</div></div>`;
  }
  if (!stage.events.length) {
    const emptyMsg = lang === 'vi' ? 'chưa có event ở giai đoạn này' : 'no events yet';
    return `<div class="eventlog-bot-stage"><div class="eventlog-bot-stage-title" style="color:var(--text-4)">${title} — ${emptyMsg}</div></div>`;
  }
  const steps = stage.events.map((e) => {
    const logLine = e.log ? `<div class="eventlog-bot-step-log">${eventlogBotEscapeHtml(e.log)}</div>` : '';
    const techBits = [];
    if (e.mdgLogID) techBits.push(`mdgLogID: ${eventlogBotEscapeHtml(e.mdgLogID)}`);
    if (e.objectID) techBits.push(`objectID: ${eventlogBotEscapeHtml(e.objectID)}`);
    if (e.activateID) techBits.push(`activateID: ${eventlogBotEscapeHtml(e.activateID)}`);
    const techLine = techBits.length
      ? `<div class="eventlog-bot-techinfo" style="font-size:10px;color:var(--text-4)">${techBits.join(' · ')}</div>` : '';
    // Submit/Approve/Activate entries have a stepID + PASSED/FAILED/BYPASS
    // status; RequestActionLog entries instead carry an `action` name
    // (e.g. "submitCreateRequest") and no discrete status at all — render
    // those as a plain action + log line, no fake status badge.
    if (e.stepID) {
      const status = (e.status || '-').toUpperCase();
      const statusLabel = eventlogBotStatusLabel(status, lang);
      return `<div class="eventlog-bot-step ${status}"><strong>${eventlogBotEscapeHtml(e.stepID)}</strong> — ${statusLabel}${logLine}${techLine}</div>`;
    }
    return `<div class="eventlog-bot-step"><strong>${eventlogBotEscapeHtml(e.action || '-')}</strong>${logLine}${techLine}</div>`;
  }).join('');
  return `<div class="eventlog-bot-stage"><div class="eventlog-bot-stage-title">${title}</div>${steps}</div>`;
}

function eventlogBotRenderResultContent(crLogs, analysis) {
  const lang = (analysis && analysis.language) === 'vi' ? 'vi' : 'en';
  const overall = crLogs.overall || 'NO_EVENTS';
  const stagesHtml = crLogs.stages.map((s) => eventlogBotRenderStage(s, lang)).join('');
  const labels = EVENTLOG_BOT_SECTION_LABELS[lang];
  const techToggleLabel = lang === 'vi' ? 'Xem chi tiết kỹ thuật' : 'Show technical details';
  const aiBox = analysis ? `
    <div class="eventlog-bot-analysis">
      <div class="eventlog-bot-analysis-label">${lang === 'vi' ? 'Phân tích Groq' : 'Groq analysis'}</div>
      ${analysis.overview ? `<div style="margin-top:4px"><strong>${labels.overview}:</strong> ${eventlogBotEscapeHtml(analysis.overview)}</div>` : ''}
      ${analysis.timeline ? `<div style="margin-top:4px"><strong>${labels.timeline}:</strong> ${eventlogBotEscapeHtml(analysis.timeline)}</div>` : ''}
      ${analysis.errors ? `<div style="margin-top:4px"><strong>${labels.errors}:</strong> ${eventlogBotEscapeHtml(analysis.errors)}</div>` : ''}
      ${analysis.recommendation ? `<div style="margin-top:4px"><strong>${labels.recommendation}:</strong> ${eventlogBotEscapeHtml(analysis.recommendation)}</div>` : ''}
    </div>` : '';
  return `
    <div class="eventlog-bot-overall ${overall}">● ${overall}</div>
    <button type="button" class="eventlog-bot-tech-toggle" onclick="this.closest('.eventlog-bot-toggle-scope').classList.toggle('tech-hidden')">${techToggleLabel}</button>
    ${stagesHtml}
    ${aiBox}`;
}

function eventlogBotRenderResult(crLogs, analysis) {
  return eventlogBotWrapMessage('bot', eventlogBotRenderResultContent(crLogs, analysis), 'tech-hidden eventlog-bot-toggle-scope');
}

function eventlogBotRenderBatchResult(results) {
  const langHit = results.find((r) => r.ok && r.analysis && r.analysis.language);
  const lang = langHit && langHit.analysis.language === 'vi' ? 'vi' : 'en';
  const header = lang === 'vi'
    ? `📊 KẾT QUẢ TRA CỨU HÀNG LOẠT (${results.length} CR)`
    : `📊 BATCH LOOKUP RESULTS (${results.length} CRs)`;
  const detailLabel = lang === 'vi' ? 'Xem chi tiết' : 'Show details';
  const notFoundLabel = lang === 'vi' ? 'Không tra cứu được' : 'Could not look up';

  const blocks = results.map((r) => {
    if (!r.ok) {
      return `<div class="eventlog-bot-batch-item">
        <strong>❌ ${eventlogBotEscapeHtml(r.crNumber)}</strong> — ${notFoundLabel}: ${eventlogBotEscapeHtml(r.error)}
      </div>`;
    }
    const overall = r.crLogs.overall || 'NO_EVENTS';
    const icon = overall === 'PASSED' ? '✅' : overall === 'FAILED' ? '❌' : '⚪';
    const oneLiner = overall === 'FAILED' && r.analysis && r.analysis.errors
      ? r.analysis.errors
      : (r.analysis && r.analysis.overview) || '';
    return `<div class="eventlog-bot-batch-item">
      <strong>${icon} ${eventlogBotEscapeHtml(r.crNumber)}</strong> — <span class="eventlog-bot-overall ${overall}" style="display:inline">${eventlogBotEscapeHtml(overall)}</span>
      ${oneLiner ? `<div style="margin-top:2px">${eventlogBotEscapeHtml(oneLiner)}</div>` : ''}
      <details class="eventlog-bot-batch-details tech-hidden eventlog-bot-toggle-scope"><summary>${detailLabel}</summary>${eventlogBotRenderResultContent(r.crLogs, r.analysis)}</details>
    </div>`;
  }).join('');

  return eventlogBotWrapMessage('bot', `
    <div style="font-weight:700;margin-bottom:6px">${header}</div>
    ${blocks}`);
}

// Greeting/farewell/intro are matched by keyword, entirely client-side —
// free and instant, no Groq call. Only genuine small talk that matches none
// of these falls through to eventlogBotRunChitchat() (1 Groq call, no SAP
// data attached, so it's cheap against the TPM budget the CR-analysis path
// keeps bumping into).
const EVENTLOG_BOT_FAREWELL_WORDS = ['bye', 'goodbye', 'tạm biệt', 'tam biet', 'hẹn gặp lại', 'hen gap lai', 'cảm ơn', 'cam on', 'thanks', 'thank you'];
const EVENTLOG_BOT_INTRO_WORDS = ['bạn là ai', 'ban la ai', 'who are you', 'what can you do', 'what else can you do', 'giúp gì', 'giup gi', 'làm được gì', 'lam duoc gi', 'hướng dẫn', 'huong dan', 'chức năng', 'chuc nang', 'help'];
const EVENTLOG_BOT_GREETING_WORDS = ['hi', 'hello', 'hey', 'chào', 'chao', 'alo'];
// Auto Bot's OTHER capability — questions about this dashboard's own
// Playwright test run history (separate from SAP CR lookups). Checked after
// CR/farewell/intro/greeting so it doesn't steal those; a false-positive
// match here just costs one cheap classifyTestQuery() call that can return
// "unclear" and fall through to a friendly fallback, not a wrong answer.
const EVENTLOG_BOT_TESTDATA_WORDS = [
  'test', 'testing', 'tests', 'testcase', 'test case', 'run', 'runs', 'suite', 'suites',
  'pass', 'passed', 'pass rate', 'passing', 'fail', 'failed', 'failing',
  'flaky', 'coverage', 'qa', 'regression',
];
const EVENTLOG_BOT_FAREWELL_REPLIES = [
  'Bye for now! Come back anytime you need a CR looked up or a test report 👋',
  'You\'re welcome! See you around 😊',
];
const EVENTLOG_BOT_INTRO_REPLIES = [
  'I\'m Capybara 🦫, your assistant here in Automation Hub. I can help with two things:\n'
  + '• SAP MDG CR lookups — type a CR number (e.g. "check CR0000029831") and I\'ll analyze its Submit/Approve/Activate/RequestAction event log, up to 3 CRs at a time.\n'
  + '• Test results — ask about this dashboard\'s own Playwright runs: QA health ("how\'s QA doing this week?"), the latest run, top failing or flaky tests, or a specific suite ("how\'s suite X doing?").',
];
const EVENTLOG_BOT_GREETING_REPLIES = [
  'Hey there! 👋 Type a CR number or ask about test results and I\'ll take it from there.',
  'Hi! Need a CR checked or curious how QA is doing? Just ask.',
];

function eventlogBotPickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
// `strict` word-boundary matching guards short greeting words (e.g. "hi")
// against false positives inside unrelated words (e.g. "history"). It
// backfires for QA jargon that's often written as one compound word
// ("testcase" has no word boundary after "test"), so the test-data keyword
// check below passes strict:false to always use plain substring matching.
function eventlogBotMatchesAny(lowerText, words, strict = true) {
  return words.some((w) => (strict && /^[a-z]{1,4}$/.test(w) ? new RegExp(`\\b${w}\\b`).test(lowerText) : lowerText.includes(w)));
}
function eventlogBotDetectLang(text) {
  return /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(text) ? 'vi' : 'en';
}

async function sendEventlogBotQuery() {
  const input = $('eventlogBotInput');
  const raw = (input.value || '').trim();
  if (!raw) return;
  const matches = raw.match(/CR\d{6,}/gi) || [];
  const crNumbers = [...new Set(matches.map((m) => m.toUpperCase()))];
  const body = $('eventlogBotBody');
  body.insertAdjacentHTML('beforeend', eventlogBotWrapMessage('user', eventlogBotEscapeHtml(raw)));
  input.value = '';
  body.scrollTop = body.scrollHeight;

  if (crNumbers.length > EVENTLOG_BOT_MAX_CRS) {
    body.insertAdjacentHTML('beforeend', eventlogBotWrapMessage('bot', `⚠ To keep things fast, please look up at most ${EVENTLOG_BOT_MAX_CRS} CRs at a time!`, 'is-error'));
    body.scrollTop = body.scrollHeight;
    return;
  }

  // A CR number always wins, even if the message also contains greeting
  // words (e.g. "chào bot, check giúp CR0000029831") — the lookup is the
  // useful part of that message.
  if (crNumbers.length) {
    await eventlogBotRunCrQuery(crNumbers, raw, body);
    return;
  }

  const lower = raw.toLowerCase();
  if (eventlogBotMatchesAny(lower, EVENTLOG_BOT_FAREWELL_WORDS)) {
    body.insertAdjacentHTML('beforeend', eventlogBotWrapMessage('bot', eventlogBotEscapeHtml(eventlogBotPickRandom(EVENTLOG_BOT_FAREWELL_REPLIES)), 'plain-text'));
    body.scrollTop = body.scrollHeight;
    return;
  }
  if (eventlogBotMatchesAny(lower, EVENTLOG_BOT_INTRO_WORDS)) {
    body.insertAdjacentHTML('beforeend', eventlogBotWrapMessage('bot', eventlogBotEscapeHtml(eventlogBotPickRandom(EVENTLOG_BOT_INTRO_REPLIES)), 'plain-text'));
    body.scrollTop = body.scrollHeight;
    return;
  }
  if (eventlogBotMatchesAny(lower, EVENTLOG_BOT_GREETING_WORDS)) {
    body.insertAdjacentHTML('beforeend', eventlogBotWrapMessage('bot', eventlogBotEscapeHtml(eventlogBotPickRandom(EVENTLOG_BOT_GREETING_REPLIES)), 'plain-text'));
    body.scrollTop = body.scrollHeight;
    return;
  }
  if (eventlogBotMatchesAny(lower, EVENTLOG_BOT_TESTDATA_WORDS, false)) {
    await eventlogBotRunTestQuery(raw, body);
    return;
  }

  await eventlogBotRunChitchat(raw, body);
}

async function eventlogBotRunCrQuery(crNumbers, raw, body) {
  const loadingId = 'eventlogBotLoading' + Date.now();
  body.insertAdjacentHTML('beforeend', eventlogBotTypingHtml(loadingId));
  body.scrollTop = body.scrollHeight;

  try {
    const lang = eventlogBotDetectLang(raw);
    const data = await fetch('/api/eventlog-bot/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crNumbers, question: raw, language: lang }),
    }).then((r) => r.json());
    const slot = $(loadingId);
    if (!data.ok) {
      const msg = data.code === 'SAP_SESSION_EXPIRED'
        ? 'Your SAP session has expired. Update the cookie on Settings and try again.'
        : ('⚠ ' + data.error);
      slot.outerHTML = eventlogBotWrapMessage('bot', eventlogBotEscapeHtml(msg), 'is-error');
      return;
    }
    if (data.results.length === 1 && !data.results[0].ok) {
      slot.outerHTML = eventlogBotWrapMessage('bot', `⚠ ${eventlogBotEscapeHtml(data.results[0].error)}`, 'is-error');
    } else {
      slot.outerHTML = data.results.length === 1
        ? eventlogBotRenderResult(data.results[0].crLogs, data.results[0].analysis)
        : eventlogBotRenderBatchResult(data.results);
    }
  } catch (err) {
    const slot = $(loadingId);
    if (slot) slot.outerHTML = eventlogBotWrapMessage('bot', `⚠ ${eventlogBotEscapeHtml(err.message)}`, 'is-error');
  } finally {
    body.scrollTop = body.scrollHeight;
  }
}

async function eventlogBotRunChitchat(raw, body) {
  const loadingId = 'eventlogBotLoading' + Date.now();
  body.insertAdjacentHTML('beforeend', eventlogBotTypingHtml(loadingId));
  body.scrollTop = body.scrollHeight;

  try {
    const lang = eventlogBotDetectLang(raw);
    const data = await fetch('/api/eventlog-bot/chitchat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: raw, language: lang }),
    }).then((r) => r.json());
    const slot = $(loadingId);
    if (!data.ok) {
      slot.outerHTML = eventlogBotWrapMessage('bot', `⚠ ${eventlogBotEscapeHtml(data.error)}`, 'is-error');
      return;
    }
    slot.outerHTML = eventlogBotWrapMessage('bot', eventlogBotEscapeHtml(data.reply), 'plain-text');
  } catch (err) {
    const slot = $(loadingId);
    if (slot) slot.outerHTML = eventlogBotWrapMessage('bot', `⚠ ${eventlogBotEscapeHtml(err.message)}`, 'is-error');
  } finally {
    body.scrollTop = body.scrollHeight;
  }
}

const EVENTLOG_BOT_TESTQUERY_TITLES = {
  overview: 'QA Overview',
  latest_run: 'Latest Run',
  top_failing: 'Top Failing Tests',
  flaky: 'Flaky Tests',
  suite_health: 'Suite Health',
};

function eventlogBotFmtDate(ms) {
  return ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '—';
}

function eventlogBotRenderTestQueryResult(reportType, days, data, analysis) {
  if (reportType === 'unclear') {
    return 'I\'m not sure which test report you mean. Try something like: "how\'s QA doing this week?", '
      + '"what\'s the latest run?", "what\'s failing the most?", "any flaky tests?", or "how\'s suite X doing?".';
  }
  if (reportType === 'suite_not_found') {
    const list = (data && data.length) ? data.join(', ') : '(no suites found)';
    return `I couldn't find a suite matching that name. Available suites: ${eventlogBotEscapeHtml(list)}.`;
  }

  const title = `📈 ${EVENTLOG_BOT_TESTQUERY_TITLES[reportType] || 'Test Report'}${days ? ` — last ${days}d` : ''}`;
  let statLine = '';
  let listHtml = '';

  if (reportType === 'overview' && data && data.stats) {
    const s = data.stats;
    statLine = `${s.passed ?? 0}/${s.totalExecutions ?? 0} passed (${s.passRate ?? '—'}%) · ${s.failed ?? 0} failed (${s.failRate ?? '—'}%) · ${s.flaky ?? 0} flaky (${s.flakyRate ?? '—'}%) · ${s.totalRuns ?? 0} run(s)`;
  } else if (reportType === 'latest_run') {
    if (!data) {
      statLine = 'No runs recorded yet.';
    } else {
      const sm = data.summary || {};
      statLine = `${eventlogBotEscapeHtml(data.label || data.suiteName || data.id)} — ${eventlogBotEscapeHtml((data.status || '').toUpperCase())} · ${sm.passed ?? 0}/${sm.totalTests ?? 0} passed · ${eventlogBotFmtDate(data.startTime)}`;
    }
  } else if (reportType === 'top_failing') {
    const top = (data && data.topFailing) || [];
    statLine = top.length ? `${top.length} test(s) with failures` : 'No failing tests in this window.';
    listHtml = top.slice(0, 5).map((t) => `<div class="eventlog-bot-step">${eventlogBotEscapeHtml(t.title)} <span style="color:var(--text-4)">(${eventlogBotEscapeHtml(t.suiteName)})</span> — ${t.failCount} fail(s)</div>`).join('');
  } else if (reportType === 'flaky') {
    const list = (data && data.flaky) || [];
    statLine = list.length ? `${list.length} flaky test(s)` : 'No flaky tests detected in this window.';
    listHtml = list.slice(0, 5).map((t) => `<div class="eventlog-bot-step">${eventlogBotEscapeHtml(t.title)} <span style="color:var(--text-4)">(${eventlogBotEscapeHtml(t.suiteName)})</span> — flakiness ${t.flakinessScore}</div>`).join('');
  } else if (reportType === 'suite_health') {
    if (!data) {
      statLine = 'No health data for this suite yet.';
    } else {
      statLine = `${eventlogBotEscapeHtml(data.suiteName)} — ${data.passRate ?? '—'}% pass rate · ${data.failures ?? 0} failure(s) · ${data.flaky ?? 0} flaky · last run ${eventlogBotFmtDate(data.lastRunTime)}`;
    }
  }

  let analysisHtml = '';
  if (analysis) {
    const alang = analysis.language === 'vi' ? 'vi' : 'en';
    const L = alang === 'vi'
      ? { groqAnalysis: 'Phân tích Groq', trends: 'Xu hướng', riskAreas: 'Rủi ro', recommendations: 'Đề xuất', recommendation: 'Đề xuất' }
      : { groqAnalysis: 'Groq analysis', trends: 'Trends', riskAreas: 'Risk areas', recommendations: 'Recommendations', recommendation: 'Recommendation' };
    if (reportType === 'overview') {
      // summarizeReport()'s shape (Report Center's existing AI summary), reused as-is.
      analysisHtml = `
        <div class="eventlog-bot-analysis">
          <div class="eventlog-bot-analysis-label">${L.groqAnalysis}</div>
          ${analysis.healthAssessment ? `<div>${eventlogBotEscapeHtml(analysis.healthAssessment)}</div>` : ''}
          ${analysis.trends ? `<div style="margin-top:4px"><strong>${L.trends}:</strong> ${eventlogBotEscapeHtml(analysis.trends)}</div>` : ''}
          ${analysis.riskAreas ? `<div style="margin-top:4px"><strong>${L.riskAreas}:</strong> ${eventlogBotEscapeHtml(analysis.riskAreas)}</div>` : ''}
          ${(analysis.recommendations || []).length ? `<div style="margin-top:4px"><strong>${L.recommendations}:</strong> ${analysis.recommendations.map(eventlogBotEscapeHtml).join('; ')}</div>` : ''}
        </div>`;
    } else {
      analysisHtml = `
        <div class="eventlog-bot-analysis">
          <div class="eventlog-bot-analysis-label">${L.groqAnalysis}</div>
          ${analysis.summary ? `<div>${eventlogBotEscapeHtml(analysis.summary)}</div>` : ''}
          ${analysis.recommendation ? `<div style="margin-top:4px"><strong>${L.recommendation}:</strong> ${eventlogBotEscapeHtml(analysis.recommendation)}</div>` : ''}
        </div>`;
    }
  }

  return `<div style="font-weight:700;margin-bottom:4px">${title}</div>
    <div style="color:var(--text-3)">${statLine}</div>
    ${listHtml}
    ${analysisHtml}`;
}

async function eventlogBotRunTestQuery(raw, body) {
  const loadingId = 'eventlogBotLoading' + Date.now();
  body.insertAdjacentHTML('beforeend', eventlogBotTypingHtml(loadingId));
  body.scrollTop = body.scrollHeight;

  try {
    const lang = eventlogBotDetectLang(raw);
    const data = await fetch('/api/eventlog-bot/test-query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: raw, language: lang }),
    }).then((r) => r.json());
    const slot = $(loadingId);
    if (!data.ok) {
      slot.outerHTML = eventlogBotWrapMessage('bot', `⚠ ${eventlogBotEscapeHtml(data.error)}`, 'is-error');
      return;
    }
    slot.outerHTML = eventlogBotWrapMessage('bot', eventlogBotRenderTestQueryResult(data.reportType, data.days, data.data || data.availableSuites, data.analysis));
  } catch (err) {
    const slot = $(loadingId);
    if (slot) slot.outerHTML = eventlogBotWrapMessage('bot', `⚠ ${eventlogBotEscapeHtml(err.message)}`, 'is-error');
  } finally {
    body.scrollTop = body.scrollHeight;
  }
}

// ── Boot: inject the shell, then run page-specific init if defined ────
async function initShell(activePage) {
  shellInitTheme();
  shellInitDensity();
  const slot = $('shell-slot');
  if (slot) {
    const html = await fetch('/partials/shell.html').then((r) => r.text());
    slot.innerHTML = html;
    shellInitTheme(); // re-apply icon state now that the button exists in the DOM
    shellInitDensity(); // re-apply label now that the button exists in the DOM
    document.querySelectorAll('.nav-item').forEach((el) => {
      if (el.dataset.page === activePage) el.classList.add('active');
    });
    shellLoadEnvironment();
    shellLoadVersion();
    mountEventlogBot();
  }
  document.addEventListener('keydown', shellHandleKeydown);
  if (typeof onShellReady === 'function') onShellReady();
}
