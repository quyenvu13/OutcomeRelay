import {
  cleanError,
  connectWallet,
  contractExplorerUrl,
  currentWallet,
  readAttempt,
  readAttempts,
  readConfig,
  readObligation,
  shortAddress,
  submitWrite,
  txExplorerUrl,
  waitForAuthoritativeExecution,
} from './genlayer.js'
import {
  CONTRACT_ADDRESS,
  CONTRACT_CLASS,
  CONTRACT_VERSION,
  SOURCE_SHA256,
} from './config.js'
import { assertTextBudget, pyStrip, textBudget } from './text-boundary.js'
import {
  verifyAcknowledgePostcondition,
  verifyCreatePostcondition,
  verifyProposalPostcondition,
  verifyRollbackPostcondition,
} from './tx-truth.js'

const app = document.querySelector('#app')
const routes = ['overview', 'create', 'relay', 'attempts', 'verification']
const state = {
  route: routeFromHash(),
  config: null,
  configError: '',
  account: null,
  client: null,
  obligationId: Number(localStorage.getItem('outcomeRelay.obligationId') || 1),
  obligation: null,
  attempts: [],
  auditFrom: 1,
  auditCount: 12,
  busy: '',
  notice: null,
}

function routeFromHash() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0]
  return routes.includes(name) ? name : 'overview'
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function num(value) {
  return Number(value ?? 0).toLocaleString('en-US')
}

function statusClass(value) {
  const text = String(value || '').toLowerCase()
  if (text.includes('armed') || text.includes('preserves') || text.includes('success')) return 'positive'
  if (text.includes('pending') || text.includes('cache')) return 'waiting'
  if (text.includes('inadequate') || text.includes('error') || text.includes('rollback')) return 'negative'
  return 'neutral'
}

function navItem(route, label, index) {
  return `<a class="nav-item ${state.route === route ? 'active' : ''}" href="#/${route}"><span>0${index}</span>${label}</a>`
}

function shell(content) {
  const configState = state.config ? 'Live read' : state.configError ? 'Read error' : 'Reading…'
  const wallet = state.account ? shortAddress(state.account, 6, 5) : 'Connect wallet'
  return `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#/overview" aria-label="OutcomeRelay home">
          <img src="/OutcomeRelay-logo.svg" alt="" />
          <span><strong>OutcomeRelay</strong><small>functional substitution guard</small></span>
        </a>
        <div class="network"><i></i> StudioNet · 61999 <span>${esc(configState)}</span></div>
        <div class="top-actions">
          <a class="ghost-button" href="${contractExplorerUrl()}" target="_blank" rel="noreferrer">Explorer ↗</a>
          <button class="wallet-button" data-action="connect">${esc(wallet)}</button>
        </div>
      </header>
      <nav class="rail" aria-label="Primary navigation">
        <div class="rail-mark">OR / 1.1</div>
        ${navItem('overview', 'Control room', 1)}
        ${navItem('create', 'Create duty', 2)}
        ${navItem('relay', 'Relay desk', 3)}
        ${navItem('attempts', 'Attempt ledger', 4)}
        ${navItem('verification', 'Verification', 5)}
        <div class="rail-foot"><span>Source locked</span><code>${SOURCE_SHA256.slice(0, 8)}…${SOURCE_SHA256.slice(-8)}</code></div>
      </nav>
      <main class="workspace">${content}</main>
      ${noticeView()}
    </div>`
}

function noticeView() {
  if (!state.notice) return ''
  const { kind = 'info', title, message, hash } = state.notice
  return `<aside class="toast ${esc(kind)}" role="status">
    <button data-action="dismiss" aria-label="Dismiss">×</button>
    <small>${kind === 'success' ? 'POSTCONDITION VERIFIED' : kind === 'error' ? 'TRANSACTION NOT APPLIED' : 'TRANSACTION STATUS'}</small>
    <strong>${esc(title)}</strong>
    <p>${esc(message)}</p>
    ${hash ? `<a href="${txExplorerUrl(hash)}" target="_blank" rel="noreferrer">Inspect transaction ↗</a>` : ''}
  </aside>`
}

function pageHead(kicker, title, copy, extra = '') {
  return `<section class="page-head"><div><small>${esc(kicker)}</small><h1>${title}</h1></div><p>${esc(copy)}</p>${extra}</section>`
}

function overview() {
  const c = state.config || {}
  const stats = [
    ['Obligations', state.config ? num(c.obligation_count) : '—', 'immutable records'],
    ['Substitutes', state.config ? num(c.substitute_count) : '—', 'accepted relays'],
    ['Semantic cap', state.config ? num(c.max_model_calls_per_obligation) : '—', 'fresh calls / duty'],
    ['Version', state.config ? esc(c.version) : '—', esc(c.prompt_version || 'contract read pending')],
  ]
  return shell(`
    <section class="overview-grid">
      <div class="overview-copy">
        <div class="eyebrow"><span>OUTCOME ANCHOR</span><span>DUTY RELAY</span></div>
        <h1>Change the duty.<br><em>Keep the result.</em></h1>
        <p>OutcomeRelay lets one party propose a different way to perform a duty while GenLayer validators decide a single question: does it preserve the protected outcome?</p>
        <div class="hero-actions">
          <a class="primary-button" href="#/create">Create an obligation <b>→</b></a>
          <a class="text-link" href="#/relay">Open relay desk</a>
        </div>
      </div>
      <div class="relay-board">
        <div class="board-top"><span>LIVE LOGIC / v${esc(c.version || CONTRACT_VERSION)}</span><span>SEMANTIC CONSENSUS</span></div>
        <div class="route-map">
          <article><small>IMMUTABLE</small><strong>Original duty</strong><p>Who must do what</p></article>
          <div class="route-line"><i></i><span>→</span></div>
          <article class="anchor"><small>LOCKED</small><strong>Protected<br>outcome</strong><b>◎</b></article>
          <div class="route-line"><i></i><span>→</span></div>
          <article><small>RELAYABLE</small><strong>Substitute duty</strong><p>Only if equivalent</p></article>
        </div>
        <div class="board-result"><span class="pass-dot"></span><div><small>ACCEPT</small><strong>Outcome preserved</strong></div><span class="deny-dot"></span><div><small>REJECT</small><strong>Outcome weakened</strong></div></div>
      </div>
    </section>
    <section class="stats-row">${stats.map(([a, b, d]) => `<article><small>${a}</small><strong>${b}</strong><span>${d}</span></article>`).join('')}</section>
    <section class="boundary-grid">
      <article class="boundary-card dark"><small>01 · THE ANCHOR</small><h2>The outcome stays fixed.</h2><p>Every proposed substitute is compared with the protected outcome created with the obligation—not with the latest wording.</p></article>
      <article class="boundary-card lime"><small>02 · THE RELAY</small><h2>The duty may move.</h2><p>Accepted wording becomes active without rewriting the original record. Rejected attempts remain auditable.</p></article>
      <article class="boundary-card"><small>03 · THE LIMIT</small><h2>Semantic, not operational.</h2><p>The contract classifies functional preservation. It does not execute services or prove external facts.</p></article>
    </section>`)
}

function createPage() {
  return shell(`${pageHead('NEW OBLIGATION · TWO-PARTY SETUP', 'Fix the outcome.<br><em>Then relay the duty.</em>', 'The connected wallet becomes the obligor. The obligee must acknowledge the protected outcome before any substitute can be evaluated.')}
    <section class="form-layout">
      <form class="panel form-panel" data-form="create">
        <div class="panel-label"><span>01</span> Original duty</div>
        <label>What must be done?<textarea name="originalDuty" rows="3" maxlength="4000" placeholder="Describe the current duty precisely." required></textarea><small data-budget="originalDuty">0 / 150 UTF-8 bytes</small></label>
        <div class="panel-label"><span>02</span> Protected outcome</div>
        <label>What result must remain true?<textarea name="protectedOutcome" rows="3" maxlength="4000" placeholder="State the concrete result that may not be weakened." required></textarea><small data-budget="protectedOutcome">0 / 150 UTF-8 bytes</small></label>
        <div class="panel-label"><span>03</span> Counterparty</div>
        <label>Obligee address<input name="obligee" placeholder="0x…" pattern="0x[a-fA-F0-9]{40}" required /></label>
        <button class="primary-button submit" ${state.busy ? 'disabled' : ''}>${state.busy || 'Create obligation'} <b>→</b></button>
      </form>
      <aside class="explain-panel">
        <small>CREATION SEQUENCE</small>
        <ol><li><b>Obligor</b><span>Connected wallet creates the immutable duty and outcome.</span></li><li><b>Obligee</b><span>Counterparty acknowledges the protected outcome.</span></li><li><b>Validators</b><span>Future substitutes are judged against that same outcome.</span></li></ol>
        <div class="truth-note"><strong>Execution truth</strong><p>Submitted ≠ finalized ≠ successful. This interface also reads the resulting contract state before it reports success.</p></div>
      </aside>
    </section>`)
}

function obligationLookup(title = 'Load obligation') {
  return `<form class="lookup" data-form="lookup"><label>Obligation ID<input name="obligationId" type="number" min="1" value="${state.obligationId}" required /></label><button>${esc(title)} →</button></form>`
}

function metric(label, value) {
  return `<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`
}

function recordView(o) {
  if (!o) return `<div class="empty-state"><b>No obligation loaded.</b><span>Enter an on-chain ID to open the relay desk.</span></div>`
  const account = String(state.account || '').toLowerCase()
  const role = account === String(o.obligor).toLowerCase() ? 'OBLIGOR' : account === String(o.obligee).toLowerCase() ? 'OBLIGEE' : 'OBSERVER'
  return `<section class="record-card">
    <div class="record-head"><div><small>OBLIGATION #${num(o.obligation_id)}</small><h2>${role === 'OBSERVER' ? 'Observer view' : `You are the ${role.toLowerCase()}`}</h2></div><span class="pill ${statusClass(o.outcome_status)}">${esc(o.outcome_status)}</span></div>
    <div class="parties"><span><small>OBLIGOR</small>${esc(shortAddress(o.obligor, 8, 6))}</span><b>→</b><span><small>OBLIGEE</small>${esc(shortAddress(o.obligee, 8, 6))}</span></div>
    <div class="duty-grid">
      <article><small>IMMUTABLE ORIGINAL</small><p>${esc(o.original_duty)}</p></article>
      <article class="outcome"><small>PROTECTED OUTCOME</small><p>${esc(o.protected_outcome)}</p></article>
      <article class="active"><small>ACTIVE DUTY · ${Number(o.active_substitute_id) ? `SUBSTITUTE #${num(o.active_substitute_id)}` : 'ORIGINAL'}</small><p>${esc(o.active_text)}</p></article>
    </div>
    <div class="record-metrics">${metric('Attempts', num(o.attempt_count))}${metric('Model calls', num(o.model_calls))}${metric('Accepted', num(o.accepted_substitutions))}${metric('Rejected', num(o.rejected_substitutions))}</div>
  </section>`
}

function relayPage() {
  const o = state.obligation
  const canAck = o && String(o.outcome_status) === 'OUTCOME_PENDING'
  const canPropose = o && String(o.outcome_status) === 'OUTCOME_ARMED'
  return shell(`${pageHead('RELAY DESK · LIVE CONTRACT STATE', 'One outcome.<br><em>More than one duty.</em>', 'Load an obligation, arm its protected outcome as the obligee, then submit substitute wording for semantic consensus.', obligationLookup())}
    ${recordView(o)}
    ${o ? `<section class="action-grid">
      <article class="action-card acknowledge">
        <small>COUNTERPARTY CONTROL</small><h3>Acknowledge outcome</h3><p>Only the immutable obligee may arm this obligation. No semantic model call is used.</p>
        <button data-action="acknowledge" ${!canAck || state.busy ? 'disabled' : ''}>${canAck ? 'Arm protected outcome' : 'Outcome already armed'} →</button>
      </article>
      <form class="action-card propose" data-form="propose">
        <small>SEMANTIC WRITE</small><h3>Propose substitute duty</h3><p>Validators compare this wording with the protected outcome, not merely with the current sentence.</p>
        <label><textarea name="substituteText" rows="4" maxlength="4000" placeholder="Describe a functionally equivalent duty." required></textarea><small data-budget="substituteText">0 / 150 UTF-8 bytes</small></label>
        <button ${!canPropose || state.busy ? 'disabled' : ''}>Run semantic relay →</button>
      </form>
    </section>` : ''}`)
}

function attemptCard(a) {
  const verdict = String(a.verdict || 'UNKNOWN')
  return `<article class="attempt-card">
    <span class="attempt-index">#${num(a.attempt_id)}</span>
    <div class="attempt-copy"><small>PROPOSER ${esc(shortAddress(a.proposer, 7, 5))}</small><p>${esc(a.substitute_text)}</p></div>
    <div class="attempt-verdict"><span class="pill ${statusClass(verdict)}">${esc(verdict.replace('SUBSTITUTE_', ''))}</span><small>${esc(a.verdict_source)}${a.used_cache ? ' · CACHED' : ' · FRESH'}</small></div>
  </article>`
}

function attemptsPage() {
  return shell(`${pageHead('APPEND-ONLY EVIDENCE', 'Every relay attempt.<br><em>In order.</em>', 'Accepted and rejected candidates remain readable. Cache disclosures show whether the contract spent a fresh semantic call.')}
    <section class="ledger-panel">
      <form class="audit-controls" data-form="audit">
        <label>Obligation ID<input name="obligationId" type="number" min="1" value="${state.obligationId}" required /></label>
        <label>From attempt<input name="fromId" type="number" min="1" value="${state.auditFrom}" required /></label>
        <label>Count<input name="count" type="number" min="1" max="50" value="${state.auditCount}" required /></label>
        <button>Load ledger →</button>
      </form>
      <div class="attempt-list">${state.attempts.length ? state.attempts.map(attemptCard).join('') : `<div class="empty-state"><b>No attempt data loaded.</b><span>Choose an obligation and read its accepted on-chain history.</span></div>`}</div>
    </section>`)
}

function verificationPage() {
  const c = state.config || {}
  return shell(`${pageHead('REVIEWER SURFACE', 'Verify the relay.<br><em>Not the claim.</em>', 'Deployment identity, frozen source and runtime evidence are separated so a reviewer can inspect each one directly.')}
    <section class="verify-grid">
      <article class="verify-card address-card"><small>PROJECT DEPLOYMENT · ${state.config ? 'LIVE READ VERIFIED' : 'READ PENDING'}</small><h2>${esc(CONTRACT_ADDRESS)}</h2><dl><div><dt>Network</dt><dd>GenLayer StudioNet</dd></div><div><dt>Contract class</dt><dd>${esc(CONTRACT_CLASS)}</dd></div><div><dt>Contract version</dt><dd>${esc(c.version || CONTRACT_VERSION)}</dd></div></dl><a href="${contractExplorerUrl()}" target="_blank" rel="noreferrer">Open StudioNet Explorer ↗</a></article>
      <article class="verify-card"><small>FROZEN SOURCE</small><code class="hash">${esc(SOURCE_SHA256)}</code><p>The product-facing file is <code>contract/OutcomeRelay.py</code>. Its deployed Python class remains <code>${esc(CONTRACT_CLASS)}</code>; no frontend-specific mutation is allowed.</p></article>
      <article class="verify-card"><small>EXECUTION TRUTH</small><div class="truth-chain"><span>SUBMITTED</span><b>≠</b><span>FINALIZED</span><b>≠</b><span>EXECUTION SUCCESS</span><b>≠</b><span>POSTCONDITION PASS</span></div><p>OutcomeRelay waits for authoritative execution evidence, then reads accepted state and checks method-specific invariants.</p></article>
      <article class="verify-card"><small>HONEST SCOPE</small><h3>Functional preservation only.</h3><p>The contract decides whether substitute wording preserves a protected outcome. It does not perform the duty, prove off-chain facts, or guarantee real-world compliance.</p></article>
    </section>
    <section class="review-path"><small>EXACT REVIEW PATH</small><ol><li>Open the Project address and confirm class <code>${esc(CONTRACT_CLASS)}</code>.</li><li>Read <code>get_config()</code>; confirm version 1.1 and semantic cap 8.</li><li>Create an obligation with two distinct wallets.</li><li>Confirm proposals roll back before obligee acknowledgement.</li><li>Acknowledge as obligee; verify <code>OUTCOME_ARMED</code>.</li><li>Submit one preserving and one inadequate substitute.</li><li>Inspect both attempts and counter changes.</li><li>Hash <code>contract/OutcomeRelay.py</code> and compare the frozen SHA-256.</li></ol></section>`)
}

function render() {
  const views = { overview, create: createPage, relay: relayPage, attempts: attemptsPage, verification: verificationPage }
  app.innerHTML = views[state.route]()
  bind()
}

function bind() {
  document.querySelector('[data-action="connect"]')?.addEventListener('click', handleConnect)
  document.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => { state.notice = null; render() })
  document.querySelector('[data-action="acknowledge"]')?.addEventListener('click', handleAcknowledge)
  document.querySelector('[data-form="create"]')?.addEventListener('submit', handleCreate)
  document.querySelector('[data-form="lookup"]')?.addEventListener('submit', handleLookup)
  document.querySelector('[data-form="propose"]')?.addEventListener('submit', handlePropose)
  document.querySelector('[data-form="audit"]')?.addEventListener('submit', handleAudit)
  document.querySelectorAll('textarea[data-watch], textarea').forEach((field) => {
    const output = field.parentElement.querySelector('[data-budget]')
    if (!output) return
    const update = () => { const b = textBudget(field.value); output.textContent = b.message; output.classList.toggle('over', !b.ok) }
    field.addEventListener('input', update); update()
  })
}

async function handleConnect() {
  try {
    const result = await connectWallet()
    state.account = result.account
    state.client = result.client
    state.notice = { kind: 'success', title: 'Wallet connected', message: `${shortAddress(result.account, 8, 6)} is connected to StudioNet.` }
  } catch (error) {
    state.notice = { kind: 'error', title: 'Wallet connection failed', message: cleanError(error) }
  }
  render()
}

async function writeClient() {
  if (state.client && state.account) return state.client
  const result = await connectWallet()
  state.account = result.account
  state.client = result.client
  return result.client
}

function hashOf(result) {
  return typeof result === 'string' ? result : result?.hash || result?.transactionHash
}

async function execute(functionName, args, before, readAfter, verify, label) {
  state.busy = 'Confirm in wallet…'
  state.notice = { kind: 'info', title: label, message: 'Preparing StudioNet transaction.' }
  render()
  let hash = ''
  try {
    const client = await writeClient()
    hash = hashOf(await submitWrite(client, functionName, args))
    if (!hash) throw new Error('Wallet did not return a transaction hash.')
    state.busy = 'Waiting for finalization…'
    state.notice = { kind: 'info', title: label, message: 'Transaction submitted. Waiting for authoritative execution.', hash }
    render()
    const result = await waitForAuthoritativeExecution(hash, ({ message }) => { state.busy = message; state.notice = { kind: 'info', title: label, message, hash }; render() })
    const after = await readAfter()
    if (result.outcome.ok === false) {
      const rollback = before ? verifyRollbackPostcondition(before, after) : { ok: true }
      state.notice = { kind: 'error', title: rollback.ok ? 'Execution rolled back safely' : 'Rollback invariant failed', message: result.reason, hash }
      return { ok: false, after }
    }
    if (result.outcome.ok === null) {
      state.notice = { kind: 'warning', title: 'Confirmation delayed', message: result.reason, hash }
      return { ok: false, after }
    }
    const checked = await verify(after)
    state.notice = { kind: checked.ok ? 'success' : 'error', title: checked.ok ? 'Postcondition verified' : 'Postcondition mismatch', message: checked.message, hash }
    return { ok: checked.ok, after }
  } catch (error) {
    state.notice = { kind: 'error', title: `${label} failed`, message: cleanError(error), hash }
    return { ok: false }
  } finally {
    state.busy = ''
    render()
  }
}

async function handleCreate(event) {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  const input = { originalDuty: pyStrip(data.get('originalDuty')), protectedOutcome: pyStrip(data.get('protectedOutcome')), obligee: String(data.get('obligee') || '') }
  try {
    assertTextBudget(input.originalDuty, 'Original duty'); assertTextBudget(input.protectedOutcome, 'Protected outcome')
    const before = await readConfig()
    const client = await writeClient()
    const obligor = state.account
    state.client = client
    await execute('create_obligation', [input.originalDuty, input.protectedOutcome, input.obligee], null, async () => {
      const afterConfig = await readConfig()
      const record = await readObligation(afterConfig.obligation_count)
      return { afterConfig, record }
    }, async ({ afterConfig, record }) => {
      const result = verifyCreatePostcondition(before, afterConfig, record, input, obligor)
      if (result.ok) { state.config = afterConfig; state.obligation = record; state.obligationId = Number(record.obligation_id); localStorage.setItem('outcomeRelay.obligationId', state.obligationId); location.hash = '#/relay' }
      return result
    }, 'Create obligation')
  } catch (error) { state.notice = { kind: 'error', title: 'Input rejected', message: cleanError(error) }; render() }
}

async function handleLookup(event) {
  event.preventDefault()
  const id = Number(new FormData(event.currentTarget).get('obligationId'))
  state.busy = 'Reading accepted state…'; render()
  try {
    state.obligation = await readObligation(id); state.obligationId = id; localStorage.setItem('outcomeRelay.obligationId', id)
  } catch (error) { state.notice = { kind: 'error', title: 'Obligation read failed', message: cleanError(error) } }
  state.busy = ''; render()
}

async function handleAcknowledge() {
  const before = state.obligation
  await execute('acknowledge_outcome', [state.obligationId], before, () => readObligation(state.obligationId), async (after) => {
    state.obligation = after
    return verifyAcknowledgePostcondition(before, after)
  }, 'Acknowledge outcome')
}

async function handlePropose(event) {
  event.preventDefault()
  const substitute = pyStrip(new FormData(event.currentTarget).get('substituteText'))
  try { assertTextBudget(substitute, 'Substitute duty') } catch (error) { state.notice = { kind: 'error', title: 'Input rejected', message: cleanError(error) }; render(); return }
  const before = state.obligation
  await execute('propose_substitute', [state.obligationId, substitute], before, () => readObligation(state.obligationId), async (after) => {
    const attempt = await readAttempt(state.obligationId, after.attempt_count)
    state.obligation = after
    return verifyProposalPostcondition(before, after, attempt)
  }, 'Run semantic relay')
}

async function handleAudit(event) {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  state.obligationId = Number(data.get('obligationId')); state.auditFrom = Number(data.get('fromId')); state.auditCount = Number(data.get('count'))
  localStorage.setItem('outcomeRelay.obligationId', state.obligationId)
  state.busy = 'Loading ledger…'; render()
  try { state.attempts = await readAttempts(state.obligationId, state.auditFrom, state.auditCount) }
  catch (error) { state.notice = { kind: 'error', title: 'Attempt ledger read failed', message: cleanError(error) }; state.attempts = [] }
  state.busy = ''; render()
}

window.addEventListener('hashchange', () => { state.route = routeFromHash(); render() })
window.ethereum?.on?.('accountsChanged', ([account]) => { state.account = account || null; state.client = null; render() })
window.ethereum?.on?.('chainChanged', () => { state.client = null; render() })

async function boot() {
  render()
  try { state.account = await currentWallet(); state.config = await readConfig() }
  catch (error) { state.configError = cleanError(error) }
  render()
}

boot()
