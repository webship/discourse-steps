'use strict';

// Shared plumbing of the forum steps: addresses, the request the browser cut,
// waiting for the forum's own signals, the users registry and the session
// cache, the forum's own API (as the data administrator, or as an account of
// the registry), what a scenario made and its clean-up, and the composer, the
// menus and the choosers of the forum's interface.
//
// This file registers no step. The forum is a single-page app: a page change
// asks the forum's API for the page's data while the page loading slider at
// the top of the page (`.loading-indicator-container`) shows "loading", then
// the slider says "done" and the app announces the new page. The steps wait
// for that state to end and for the background requests the page sends to
// answer, never for a fixed time. The message bus keeps one long poll open at
// all times (`/message-bus/<client>/poll`, about 25 seconds, opened again at
// once): it is no work of the page, so it is never waited for.

const { friendly } = require('webship-js/tests/step-definitions/webship');
const { request: playwrightRequest } = require('playwright');

// ---------------------------------------------------------------------------
// Budgets and text
// ---------------------------------------------------------------------------

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 15 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 15000);
}

/** White space collapsed and trimmed; the invisible marks some texts carry removed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/[­​-‏‪-‮⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** A text as a comparison sees it: cleaned, in lower case, typographic quotes and apostrophes straight, a closing colon or ellipsis dropped. */
function normal(text) {
  return clean(text).replace(/[“”„"]/g, '"').replace(/[‘’‚']/g, "'").replace(/(?:\s*[:…]|\.\.\.)$/, '').toLowerCase();
}

/** Whether a text contains another, as `normal` reads them. */
function mentions(text, part) {
  return normal(text).includes(normal(part));
}

/** Whether two texts are the same, as `normal` reads them. */
function same(a, b) {
  return normal(a) === normal(b);
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values, max = 12) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  if (!items.length) return '(none)';
  const shown = items.slice(0, max).map((item) => `"${item}"`).join(', ');
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/** The quoted strings of a list in a step: `"a", "b" and "c"` -> ['a', 'b', 'c']. */
function quotedList(text) {
  return [...String(text).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** A number of a step: `2`, or a word from zero to twenty. */
function count(text) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const t = String(text).trim().toLowerCase();
  return /^\d+$/.test(t) ? parseInt(t, 10) : words.indexOf(t);
}

/** A unique marker for test content, so two runs never meet each other's topics. */
function stamp() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** The forum's root without a trailing slash. */
function siteRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

/** An address of the forum from a path (absolute addresses stay as they are). */
function absolute(world, href) {
  if (/^https?:\/\//.test(href)) return href;
  return siteRoot(world) + (String(href).startsWith('/') ? '' : '/') + href;
}

/** The path of the page on screen: '/t/some-topic/12'. */
function currentPath(world) {
  try {
    const url = new URL(world.page.url());
    return url.pathname + url.search;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// The request the browser cut
// ---------------------------------------------------------------------------

/** The hint of a failure where the browser cut a request. */
const CUT_HINT = 'The request was cut, or the site\'s name did not resolve, because the network of the machine changed (a container starting); nothing is wrong with the scenario. Run it again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

const NETWORK_ERRORS = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/;

/**
 * Whether the browser cut a request of this page since `since` (a time stamp): it
 * shows its own error page (chrome-error://), or a request to the forum failed
 * with a network error. The message bus's long poll is left out: the forum opens
 * it again by itself. Returns a sentence for an error message, or ''.
 */
function cutRequest(world, since = 0) {
  const url = String((world.page && world.page.url()) || '');
  if (url.startsWith('chrome-error://')) {
    return `the browser shows its own error page (${url}): the request was cut before the site answered`;
  }
  const failed = (world.__forumFailedRequests || []).filter((f) => f.at >= since && NETWORK_ERRORS.test(f.error) && !/\/message-bus\//.test(f.url));
  if (failed.length) {
    const f = failed[failed.length - 1];
    return `the browser lost the request ${f.method} ${f.url.replace(siteRoot(world), '')} (${f.error}): it was cut before the site answered`;
  }
  return '';
}

/** A failure that says so when the browser cut a request of the scenario: what the page lacks may never have come. */
function withCut(world, failure, since = 0) {
  const cut = cutRequest(world, since);
  if (!cut || /cut before the site answered/.test(failure.message || '')) return failure;
  return Object.assign({}, failure, { message: `${failure.message} In this scenario ${cut}.`, hint: CUT_HINT });
}

/** A friendly failure, with the cut request named when there was one. */
function fail(world, message, hint, since = 0) {
  return friendly(withCut(world, { message, hint }, since));
}

// ---------------------------------------------------------------------------
// The page instrumentation: requests in flight, long polls, long timers
// ---------------------------------------------------------------------------

/** Whether a request is the message bus's long poll (no work of the page: it is always open). */
function isLongPoll(url) {
  return /\/message-bus\//.test(String(url));
}

/**
 * Runs in every document before the forum's own scripts (an init script).
 * webship-js counts the requests in flight and the pending timers of a page to
 * know when it settled; on the forum two kinds of them never end:
 *   - the message bus's long poll (XHR to /message-bus/<client>/poll), open at
 *     all times: it is taken out of webship-js's request count, so its own
 *     "wait for AJAX to finish" and its settle after a step work on the forum;
 *   - timers that fire many seconds or minutes later (polls, presence, the
 *     session's renewal): a timer longer than five seconds is no work the page
 *     is doing now, so it is taken out of the timer count (webship-js #573).
 * The counts of webship-js's own probe stay right whichever init script runs
 * first.
 */
function quietLongWork() {
  if (window.__webshipForumQuiet) return;
  window.__webshipForumQuiet = true;
  const counted = (name) => typeof window[name] === 'number';
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const open = XHR.prototype.open;
    XHR.prototype.open = function (method, url) {
      try { this.__webshipForumUrl = String(url); } catch (e) { /* a URL object that cannot be read */ }
      return open.apply(this, arguments);
    };
    const send = XHR.prototype.send;
    XHR.prototype.send = function () {
      const result = send.apply(this, arguments);
      if (/\/message-bus\//.test(this.__webshipForumUrl || '') && counted('__webshipAjaxCount')) {
        window.__webshipAjaxCount -= 1;
        this.addEventListener('loadend', () => { if (counted('__webshipAjaxCount')) window.__webshipAjaxCount += 1; }, { once: true });
      }
      return result;
    };
  }
  if (typeof window.setTimeout === 'function') {
    const previousSet = window.setTimeout;
    const previousClear = window.clearTimeout;
    const long = new Set();
    window.setTimeout = function (callback, delay, ...args) {
      if (!(Number(delay) > 5000) || !counted('__webshipPendingTimers')) return previousSet.call(this, callback, delay, ...args);
      let id;
      const fire = function () {
        if (long.delete(id) && counted('__webshipPendingTimers')) window.__webshipPendingTimers += 1;
        return typeof callback === 'function' ? callback.apply(this, args) : undefined;
      };
      id = previousSet.call(this, fire, delay);
      long.add(id);
      window.__webshipPendingTimers -= 1;
      return id;
    };
    window.clearTimeout = function (id) {
      if (long.delete(id) && counted('__webshipPendingTimers')) window.__webshipPendingTimers += 1;
      return previousClear.call(this, id);
    };
  }
}

const TRACKED = new WeakMap();

/**
 * The background requests (XHR and fetch) of a page that are still running,
 * from the moment the page opens, the message bus's long poll left out. A
 * navigation of the page drops those of the page it leaves.
 */
function requests(page) {
  let state = TRACKED.get(page);
  if (!state) {
    state = { pending: new Set() };
    TRACKED.set(page, state);
    const background = (request) => ['xhr', 'fetch'].includes(request.resourceType()) && !isLongPoll(request.url());
    page.on('request', (request) => { if (background(request)) state.pending.add(request); });
    const done = (request) => { state.pending.delete(request); };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) state.pending.clear(); });
  }
  return state;
}

/** Set up a page the World opened: the instrumentation above, the failed requests, the responses of what a scenario makes. */
async function instrument(world, page) {
  await page.addInitScript(quietLongWork).catch(() => {});
  requests(page);
  world.__forumFailedRequests = world.__forumFailedRequests || [];
  page.on('requestfailed', (r) => {
    const failure = r.failure();
    world.__forumFailedRequests.push({ at: Date.now(), method: r.method(), url: r.url(), error: (failure && failure.errorText) || '' });
  });
  page.on('response', (response) => { noteMade(world, response).catch(() => {}); noteReading(world, response); });
}

/**
 * Note the reading time the forum took (POST /topics/timings answered): the topic and the posts it
 * counted. The forum sends it a moment after a post was on screen, often while the step that opened the
 * topic still runs, so a later step reads what was noted.
 */
function noteReading(world, response) {
  const req = response.request();
  if (req.method() !== 'POST' || !/\/topics\/timings(\.json)?$/.test(new URL(response.url()).pathname) || response.status() >= 400) return;
  const form = new URLSearchParams(String(req.postData() || ''));
  const topic = form.get('topic_id');
  if (!topic) return;
  const posts = [...form.keys()].map((k) => (k.match(/^timings\[(\d+)\]$/) || [])[1]).filter(Boolean).map(Number);
  world.__forumReading = world.__forumReading || [];
  world.__forumReading.push({ topic: String(topic), posts, at: Date.now() });
}

/** The posts of a topic whose reading time the forum took in this scenario. */
function postsRead(world, topicId) {
  return new Set((world.__forumReading || []).filter((r) => r.topic === String(topicId)).flatMap((r) => r.posts));
}

// ---------------------------------------------------------------------------
// Waiting for the forum
// ---------------------------------------------------------------------------

/**
 * What the page still has to do, as the forum says it: '' when nothing. The
 * document loading; the page loading slider showing "loading" (the forum's
 * own state of a page change, read from the slider's service when the app
 * exposes it); a spinner of the page's main area.
 */
async function pageWork(world) {
  try {
    return await world.page.evaluate(() => {
      if (document.readyState === 'loading') return 'the document is still loading';
      const outlet = document.getElementById('main-outlet');
      if (!outlet) {
        // Not a page of the forum's app (an error page of the server, a file): nothing to wait for.
        return document.querySelector('#discourse-main, .loading-indicator-container') ? 'the app is starting' : '';
      }
      const slider = document.querySelector('.loading-indicator-container');
      if (slider && slider.classList.contains('loading')) return 'the page is changing (the loading slider shows "loading")';
      try {
        const service = window.Discourse && window.Discourse.__container__ && window.Discourse.__container__.lookup('service:loading-slider');
        if (service && service.loading) return 'the page is changing (the loading slider service is loading)';
      } catch (e) { /* the app's container is private: the slider's class above is the signal */ }
      const spinner = [...outlet.querySelectorAll('.spinner')].find((s) => !s.classList.contains('small') && s.getClientRects().length);
      if (spinner) return 'the page shows a spinner';
      return '';
    });
  } catch (err) {
    return /Execution context was destroyed|navigation|Target closed|has been closed/i.test(String(err && err.message)) ? 'a new page is loading' : '';
  }
}

/**
 * Wait until the forum is ready to use: the page change has ended (the loading
 * slider), no background request of the page is running (the long poll left
 * out), and both stayed so for a short moment (150 ms). Returns '' when it is,
 * else what the page was still doing when the time ran out; `strict` makes that
 * a failure.
 */
async function forumReady(world, { timeout, strict = false } = {}) {
  const page = world.page;
  const limit = timeout || budget(world);
  const deadline = Date.now() + limit;
  const state = requests(page);
  await page.waitForLoadState('domcontentloaded', { timeout: limit }).catch(() => {});
  let busy = '';
  let quietSince = 0;
  for (;;) {
    busy = await pageWork(world);
    if (!busy && state.pending.size) {
      busy = `requests in flight: ${[...state.pending].slice(0, 3).map((r) => `${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 80)}`).join(', ')}`;
    }
    if (!busy) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 150) return '';
    } else {
      quietSince = 0;
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(50);
  }
  if (strict) {
    throw fail(world, `The page did not finish its work within ${Math.round(limit / 1000)} seconds (${page.url()}): ${busy}.`, 'The forum shows "loading" in the slider at the top of the page while a page changes, and every request it sends answers within a moment; one that stays is a request that never came back. Look at the screenshot of the failure and the browser console.');
  }
  return busy;
}

/** Open an address of the forum and wait until it is ready. A cut request is tried again once. */
async function open(world, url) {
  const page = world.page;
  const target = absolute(world, url);
  const go = () => page.goto(target, { waitUntil: 'domcontentloaded', timeout: budget(world) * 2 });
  try {
    await go();
  } catch (err) {
    if (NETWORK_ERRORS.test(String(err && err.message)) || /chrome-error:\/\/chromewebdata|ERR_ABORTED/.test(String(err && err.message))) {
      await page.waitForTimeout(500);
      await go().catch(() => {});
    } else {
      throw friendly({ message: `Could not open ${target}.`, cause: err, hint: 'Check launchUrl in cucumber.js and that the forum is running (ddev describe).' });
    }
  }
  if (cutRequest(world)) {
    await page.waitForTimeout(500);
    await go().catch(() => {});
  }
  await forumReady(world);
}

/**
 * Run an action and wait for the answer of the forum's API call it sends: the
 * first request whose method and address `test` accepts. The request must
 * start within `startWindow` ms (an action sends its request at once), then its
 * answer is awaited within the budget. Returns the response, or null when no
 * request went out; a request the browser cut fails the step and says so.
 */
async function withRequest(world, test, action, { timeout, startWindow = 3000, required = true, what = 'the request' } = {}) {
  const page = world.page;
  const since = Date.now();
  const limit = timeout || budget(world);
  const started = page.waitForRequest((r) => {
    try { return test(r.method(), r.url(), r); } catch { return false; }
  }, { timeout: required ? limit : startWindow }).catch(() => null);
  await action();
  const req = await started;
  let response = null;
  if (req) {
    response = await Promise.race([
      req.response().catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), limit)),
    ]);
  }
  if (!response) {
    const cut = cutRequest(world, since);
    if (cut) throw friendly({ message: `The forum did not get the answer of ${what}: ${cut}.`, hint: CUT_HINT });
    if (required) {
      throw friendly({
        message: req ? `The forum got no answer to ${what} within ${Math.round(limit / 1000)} seconds.` : `The forum did not send ${what}.`,
        hint: 'The action did not reach the server, or the server did not answer: look at the screenshot of the failure for a dialog or a message that stopped it.',
      });
    }
  }
  return response;
}

/** The JSON of a response, or null. */
async function jsonOf(response) {
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}

/** The forum's own error messages in an answer ({errors: [...]}, {error: "..."}). */
function errorsOf(json) {
  if (!json) return [];
  if (Array.isArray(json.errors)) return json.errors.map(clean);
  if (json.error) return [clean(json.error)];
  return [];
}

/** Poll a reading until it satisfies a check, or fail with the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw friendly(withCut(world, await explain(value)));
    await world.page.waitForTimeout(150);
  }
}

/** The main heading of the page, as a person reads it. */
async function heading(page) {
  return clean(await page.locator('#main-outlet h1:visible, #topic-title h1:visible, h1:visible').first().innerText({ timeout: 1500 }).catch(() => ''));
}

/** What the page on screen says about itself, for an error message. */
async function pageSummary(world) {
  const cut = cutRequest(world);
  if (cut) return cut;
  const page = world.page;
  const title = clean(await page.title().catch(() => ''));
  return `the page shows "${(await heading(page)) || '(no heading)'}" (title "${title}") at ${page.url()}`;
}

/** Bring an element to the middle of the window: the forum's sticky header covers the top of the page. */
async function toMiddle(locator) {
  await locator.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
}

/** Click an element the way a person does, with the element brought to the middle of the window first. */
async function press(locator, options = {}) {
  await locator.waitFor({ state: 'visible', timeout: options.timeout || 10000 });
  await toMiddle(locator);
  await locator.click({ timeout: options.timeout || 10000 });
}

// ---------------------------------------------------------------------------
// The users registry and the sessions
// ---------------------------------------------------------------------------

/** The account a handle of the users registry stands for: { handle, username, email, password }. */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '${handle}', password: process.env.${String(handle).toUpperCase()}_PASSWORD } }. The account itself is made once by the build of the site, never by a feature.`,
    });
  }
  const username = entry.username || (entry.email ? String(entry.email).split('@')[0] : handle);
  if (!entry.password) {
    throw friendly({
      message: `The user "${handle}" has no password in the users registry.`,
      hint: `Set worldParameters.users.${handle}.password in cucumber.js.`,
    });
  }
  return { handle, username, email: entry.email || '', password: entry.password, login: entry.username || entry.email || handle };
}

/** The username a handle of the registry stands for; anything else is a username already. */
function usernameOf(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  return users[who] ? resolveUser(world, who).username : String(who).replace(/^@/, '');
}

const XHR_HEADERS = { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };

// The sessions of the accounts that logged in during this run, by forum and
// username: the forum's cookies after a login.
const SESSIONS = new Map();

function sessionKey(world, username) {
  return `${siteRoot(world)}|${String(username).toLowerCase()}`;
}

/** Whether an account that logged in keeps its session for the rest of the run (`reuseSessions`, on by default). */
function reusesSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/** The forum's cookies of the browser's context. */
async function forumCookies(world) {
  const host = new URL(siteRoot(world)).hostname;
  return (await world.context.cookies()).filter((c) => c.domain.replace(/^\./, '') === host);
}

/** Drop the forum's cookies from the browser: the browser is anonymous, the session on the server lives on. */
async function forgetBrowserSession(world) {
  const host = new URL(siteRoot(world)).hostname;
  const keep = (await world.context.cookies()).filter((c) => c.domain.replace(/^\./, '') !== host);
  await world.context.clearCookies();
  if (keep.length) await world.context.addCookies(keep);
  world.__forumUser = null;
}

/** The account the forum says the browser is logged in as: its username, or '' for a visitor. */
async function currentUsername(world) {
  try {
    const res = await world.context.request.get(siteRoot(world) + '/session/current.json', { headers: XHR_HEADERS, failOnStatusCode: false });
    if (res.status() !== 200) return '';
    const json = await res.json();
    return (json && json.current_user && json.current_user.username) || '';
  } catch {
    return '';
  }
}

/** Wait once for the forum's rate limit to pass when an answer says it was met (429). Returns true when it waited. */
async function waitOutLimit(response) {
  if (!response || response.status() !== 429) return false;
  const headers = response.headers();
  let seconds = parseInt(headers['retry-after'] || headers['discourse-rate-limit-wait-seconds'] || '', 10);
  if (!Number.isFinite(seconds)) {
    const json = await response.json().catch(() => null);
    seconds = parseInt(json && json.extras && json.extras.wait_seconds, 10);
  }
  if (!Number.isFinite(seconds) || seconds > 120) seconds = 10;
  await new Promise((r) => setTimeout(r, (seconds + 1) * 1000));
  return true;
}

/**
 * Log an account in through the forum's own session endpoint, the request the
 * login form sends, with the cookies of `requestContext` (the browser's own
 * context, or a context of the data client). Returns the forum's user.
 */
async function sessionLogin(world, requestContext, account) {
  const root = siteRoot(world);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const csrfRes = await requestContext.get(root + '/session/csrf', { headers: XHR_HEADERS, failOnStatusCode: false });
    const csrf = ((await csrfRes.json().catch(() => ({}))) || {}).csrf;
    if (!csrf) throw fail(world, `The forum gave no CSRF token at ${root}/session/csrf (status ${csrfRes.status()}).`, 'Check that launchUrl in cucumber.js is the address of a running forum.');
    const res = await requestContext.post(root + '/session', { headers: { ...XHR_HEADERS, 'X-CSRF-Token': csrf }, form: { login: account.login, password: account.password }, failOnStatusCode: false });
    if (await waitOutLimit(res)) continue;
    const json = await res.json().catch(() => null);
    if (json && json.user) return json.user;
    const why = errorsOf(json).join(' ') || `status ${res.status()}`;
    throw friendly({
      message: `The forum refused the login of "${account.handle}" (${account.login}): ${why}.`,
      hint: 'Check the username and the password of the account in worldParameters.users of cucumber.js; the build of the site makes the accounts (ACCOUNTS_ONLY=1 of the build script gives them back their password).',
    });
  }
  throw friendly({ message: `The forum kept refusing the login of "${account.handle}" for its rate limit.`, hint: 'The forum limits logins from one address; the build of the test site raises the limit. Wait a minute and run again.' });
}

/**
 * Log the browser in as an account of the registry. An account that logged in
 * earlier in the run gets its session back; otherwise the forum's own session
 * endpoint logs it in (the request the login form sends). Opens `path` after.
 */
async function loginAs(world, handle, path = '/') {
  const account = resolveUser(world, handle);
  const key = sessionKey(world, account.username);
  await forgetBrowserSession(world);
  if (reusesSessions(world) && SESSIONS.has(key)) {
    await world.context.addCookies(SESSIONS.get(key));
    if (same(await currentUsername(world), account.username)) {
      world.__forumUser = account.handle;
      await open(world, path);
      return account;
    }
    SESSIONS.delete(key);
    await forgetBrowserSession(world);
  }
  await sessionLogin(world, world.context.request, account);
  if (!same(await currentUsername(world), account.username)) {
    throw fail(world, `After the login of "${handle}" the forum does not know the browser as ${account.username}.`, 'The session cookie did not stick: check that launchUrl uses the address the forum answers at (https://<project>.ddev.site).');
  }
  if (reusesSessions(world)) SESSIONS.set(key, await forumCookies(world));
  world.__forumUser = account.handle;
  await open(world, path);
  return account;
}

/** Remember the browser's session for an account (after a login through the form). */
async function keepSession(world, account) {
  if (reusesSessions(world)) SESSIONS.set(sessionKey(world, account.username), await forumCookies(world));
  world.__forumUser = account.handle;
}

/** Forget the session of an account (after it logged out). */
function dropSession(world, username) {
  SESSIONS.delete(sessionKey(world, username));
}

// ---------------------------------------------------------------------------
// The forum's API: the data client, as an account of the registry
// ---------------------------------------------------------------------------

const CLIENTS = new Map();

/**
 * A client of the forum's API logged in as an account of the registry, in a
 * session of its own (the browser's session is never touched): one per account
 * and run. `call(method, path, data)` returns { status, json }.
 */
async function apiAs(world, handle) {
  const account = resolveUser(world, handle);
  const key = sessionKey(world, account.username);
  if (CLIENTS.has(key)) return CLIENTS.get(key);
  const root = siteRoot(world);
  const ctx = await playwrightRequest.newContext({ baseURL: root, ignoreHTTPSErrors: true, extraHTTPHeaders: XHR_HEADERS });
  const user = await sessionLogin(world, ctx, account);
  let csrf = null;
  const token = async (fresh) => {
    if (!csrf || fresh) csrf = ((await (await ctx.get(root + '/session/csrf', { headers: XHR_HEADERS })).json().catch(() => ({}))) || {}).csrf;
    return csrf;
  };
  const client = {
    account,
    user,
    async call(method, path, data, { form = true } = {}) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const options = { method, headers: { ...XHR_HEADERS, 'X-CSRF-Token': await token(attempt > 0) }, failOnStatusCode: false };
        if (data !== undefined) {
          if (form) options.form = data; else options.data = data;
        }
        const res = await ctx.fetch(root + path, options);
        if (res.status() === 403 && attempt === 0) continue;
        if (await waitOutLimit(res)) continue;
        let json = null;
        try { json = await res.json(); } catch { json = null; }
        return { status: res.status(), json };
      }
      return { status: 429, json: { errors: ['rate limited'] } };
    },
  };
  CLIENTS.set(key, client);
  return client;
}

/** The data client of the data administrator (`worldParameters.dataAdmin`, an admin of the registry). */
async function dataAdmin(world) {
  const handle = (world.parameters && world.parameters.dataAdmin) || 'administrator';
  return apiAs(world, handle);
}

// The categories of the forum, by forum: [{ id, name, slug, parent }].
const CATEGORIES = new Map();

/** The categories of the forum (as the data administrator sees them). */
async function categories(world, fresh = false) {
  const key = siteRoot(world);
  if (!fresh && CATEGORIES.has(key)) return CATEGORIES.get(key);
  const client = await dataAdmin(world);
  const { json } = await client.call('GET', '/site.json');
  const list = ((json && json.categories) || []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent_category_id || null }));
  CATEGORIES.set(key, list);
  return list;
}

/** A category by its name ("Installation", or "Support > Installation"), or a friendly failure. */
async function categoryNamed(world, name) {
  const all = await categories(world);
  const parts = String(name).split(/\s*[>/]\s*/);
  const leaf = parts[parts.length - 1];
  const parentName = parts.length > 1 ? parts[0] : null;
  const found = all.filter((c) => same(c.name, leaf) && (!parentName || (all.find((p) => p.id === c.parent) || {}).name && same(all.find((p) => p.id === c.parent).name, parentName)));
  if (!found.length) {
    throw friendly({ message: `The forum has no category "${name}". It has ${listed(all.map((c) => c.name))}.`, hint: 'Name a category as the categories page shows it; a subcategory as "Parent > Child" when two have the same name.' });
  }
  return found[0];
}

/** The topics whose title is `title` exactly (as the forum's search finds them for the data administrator), private messages included. */
async function topicsTitled(world, title) {
  const client = await dataAdmin(world);
  const found = new Map();
  for (const scope of ['', ' in:all-pms']) {
    const { json } = await client.call('GET', `/search.json?q=${encodeURIComponent(`"${title}" in:title${scope}`)}`);
    for (const t of (json && json.topics) || []) {
      if (same(t.title, title) || same(t.fancy_title, title)) found.set(t.id, { id: t.id, slug: t.slug, title: t.title, archetype: t.archetype });
    }
  }
  return [...found.values()];
}

// ---------------------------------------------------------------------------
// What a scenario made, and its clean-up
// ---------------------------------------------------------------------------

/** Whether the steps clean up after a scenario (`forumCleanUp`, on by default). */
function cleansUp(world) {
  return !(world.parameters && world.parameters.forumCleanUp === false);
}

/** Register a clean-up for after the scenario, once per key; the newest runs first. */
function afterScenario(world, key, fn) {
  world.__forumCleanups = world.__forumCleanups || [];
  if (world.__forumCleanups.some((c) => c.key === key)) return;
  world.__forumCleanups.push({ key, fn });
}

/** Run the clean-ups of the scenario. A failed one is reported, the others still run. */
async function runCleanups(world) {
  const list = (world.__forumCleanups || []).slice().reverse();
  world.__forumCleanups = [];
  const problems = [];
  for (const { key, fn } of list) {
    try { await fn(); } catch (err) { problems.push(`${key}: ${(err && err.message) || err}`); }
  }
  return problems;
}

/** Delete a topic (or a message) as the data administrator after the scenario. */
function deleteTopicAfter(world, topicId) {
  if (!cleansUp(world) || !topicId) return;
  afterScenario(world, `topic:${topicId}`, async () => {
    const client = await dataAdmin(world);
    const res = await client.call('DELETE', `/t/${topicId}.json`);
    if (res.status >= 400 && res.status !== 404 && res.status !== 403) throw new Error(`DELETE /t/${topicId}.json answered ${res.status}`);
  });
}

/** Delete a reply as the data administrator after the scenario (unless its topic goes too). */
function deletePostAfter(world, postId, topicId) {
  if (!cleansUp(world) || !postId) return;
  afterScenario(world, `post:${postId}`, async () => {
    if ((world.__forumCleanups || []).some((c) => c.key === `topic:${topicId}`)) return;
    const client = await dataAdmin(world);
    const res = await client.call('DELETE', `/posts/${postId}.json`);
    if (res.status >= 400 && res.status !== 404 && res.status !== 403) throw new Error(`DELETE /posts/${postId}.json answered ${res.status}`);
  });
}

/**
 * Note what an answer of the forum says the scenario made, by the account the
 * browser is logged in as: a topic or a reply (POST /posts), a bookmark, a like.
 */
async function noteMade(world, response) {
  if (!cleansUp(world)) return;
  const req = response.request();
  const url = new URL(response.url());
  if (!url.href.startsWith(siteRoot(world))) return;
  const method = req.method();
  if (method === 'POST' && /^\/posts(\.json)?$/.test(url.pathname) && response.status() === 200) {
    const json = await response.json().catch(() => null);
    const post = json && json.post;
    if (!post) return;
    if (post.post_number === 1) deleteTopicAfter(world, post.topic_id);
    else deletePostAfter(world, post.id, post.topic_id);
    return;
  }
  const handle = world.__forumUser;
  if (!handle) return;
  if (method === 'POST' && /^\/bookmarks(\.json)?$/.test(url.pathname) && response.status() === 200) {
    const json = await response.json().catch(() => null);
    if (json && json.id) {
      afterScenario(world, `bookmark:${json.id}`, async () => {
        const client = await apiAs(world, handle);
        await client.call('DELETE', `/bookmarks/${json.id}.json`);
      });
    }
    return;
  }
  if (method === 'POST' && /^\/drafts(\.json)?$/.test(url.pathname) && response.status() === 200) {
    const key = new URLSearchParams(String(req.postData() || '')).get('draft_key');
    if (key) {
      afterScenario(world, `draft:${key}:${handle}`, async () => {
        const client = await apiAs(world, handle);
        const { json } = await client.call('GET', `/drafts/${encodeURIComponent(key)}.json`);
        if (json && json.draft) await client.call('DELETE', `/drafts/${encodeURIComponent(key)}.json?sequence=${json.draft_sequence || 0}`);
      });
    }
    return;
  }
  const like = url.pathname.match(/\/discourse-reactions\/posts\/(\d+)\/custom-reactions\/([^/]+)\/toggle(\.json)?$/);
  if (method === 'PUT' && like && response.status() === 200) {
    const key = `like:${like[1]}:${handle}`;
    world.__forumLikes = world.__forumLikes || {};
    world.__forumLikes[key] = !world.__forumLikes[key];
    afterScenario(world, key, async () => {
      if (!world.__forumLikes[key]) return;
      const client = await apiAs(world, handle);
      const { json } = await client.call('GET', `/posts/${like[1]}.json`);
      const reacted = json && json.current_user_reaction;
      const liked = json && (json.current_user_used_main_reaction || (json.actions_summary || []).some((a) => a.id === 2 && a.acted));
      if (reacted || liked) await client.call('PUT', `/discourse-reactions/posts/${like[1]}/custom-reactions/${like[2]}/toggle.json`);
    });
    return;
  }
  if (method === 'POST' && /^\/post_actions(\.json)?$/.test(url.pathname) && response.status() === 200) {
    // A like or a flag, taken back as the account that made it. A flag still waiting for the staff
    // would otherwise be agreed with when the cleanup deletes its post, and the forum would send the
    // post's author a message that the post was removed.
    const form = new URLSearchParams(String(req.postData() || ''));
    const id = form.get('id');
    const type = form.get('post_action_type_id');
    if (id && type) {
      afterScenario(world, `post-action:${id}:${type}:${handle}`, async () => {
        const client = await apiAs(world, handle);
        const res = await client.call('DELETE', `/post_actions/${id}.json?post_action_type_id=${type}`);
        if (res.status >= 400 && res.status !== 403 && res.status !== 404) throw new Error(`DELETE /post_actions/${id}.json answered ${res.status}`);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// The interface: menus, choosers, dialogs
// ---------------------------------------------------------------------------

/** The open floating menu with a given identifier (`topic-admin-menu`, `bookmark-menu`), or null. */
async function openMenu(page, identifier) {
  const menus = page.locator(`.fk-d-menu[data-identifier="${identifier}"]`);
  const n = await menus.count();
  for (let i = n - 1; i >= 0; i -= 1) {
    if (await menus.nth(i).isVisible().catch(() => false)) return menus.nth(i);
  }
  return null;
}

/** The open dialog (a modal or a dialog box), named or the last one: a locator, or null. */
async function openDialog(page, name) {
  const dialogs = page.locator('.d-modal, .dialog-container');
  const n = await dialogs.count();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = dialogs.nth(i);
    if (!(await d.isVisible().catch(() => false))) continue;
    if (!name) return d;
    const title = clean(await d.locator('.d-modal__title-text, .d-modal__title, h1, .dialog-header, .dialog-body').first().innerText({ timeout: 500 }).catch(() => ''));
    if (mentions(title, name)) return d;
  }
  return null;
}

/** The text of the forum's error dialog ("An error occurred: ..."), or ''. */
async function errorDialogText(page) {
  const d = page.locator('.dialog-container .dialog-body');
  for (let i = (await d.count()) - 1; i >= 0; i -= 1) {
    if (await d.nth(i).isVisible().catch(() => false)) return clean(await d.nth(i).innerText().catch(() => ''));
  }
  return '';
}

/** Close the forum's error dialog with its OK button. */
async function closeErrorDialog(page) {
  const ok = page.locator('.dialog-container .dialog-footer button').first();
  if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
}

/**
 * Choose a row of a chooser of the forum (a select-kit): open it, type the name
 * into its filter when it has one, click the row with that name. Multi-choice
 * choosers are closed after. Returns the names the chooser offered when the
 * name was not among them (to fail with), or '' when it chose.
 */
async function choose(world, kit, name, { filter = true } = {}) {
  const page = world.page;
  await kit.waitFor({ state: 'visible', timeout: 10000 });
  const header = kit.locator('summary, .select-kit-header').first();
  if ((await kit.getAttribute('open')) === null && !(await kit.evaluate((k) => k.classList.contains('is-expanded')).catch(() => false))) await press(header);
  const expanded = page.locator('.select-kit.is-expanded').last();
  await expanded.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const input = expanded.locator('.select-kit-filter input, input.filter-input').first();
  if (filter && await input.isVisible().catch(() => false)) {
    await input.fill('');
    await input.pressSequentially(String(name).split(/\s*>\s*/).pop(), { delay: 20 });
  }
  const wanted = String(name).split(/\s*>\s*/).pop();
  const deadline = Date.now() + 8000;
  let offered = [];
  for (;;) {
    const rows = expanded.locator('.select-kit-row');
    const n = await rows.count();
    offered = [];
    for (let i = 0; i < n; i += 1) {
      const row = rows.nth(i);
      const dataName = clean(await row.getAttribute('data-name').catch(() => ''));
      const dataValue = clean(await row.getAttribute('data-value').catch(() => ''));
      offered.push(dataName || dataValue);
      if (same(dataName, wanted) || same(dataValue, wanted)) {
        await row.click();
        if (await kit.evaluate((k) => k.classList.contains('multi-select')).catch(() => false)) await page.keyboard.press('Escape').catch(() => {});
        return '';
      }
    }
    if (Date.now() > deadline) break;
    await page.waitForTimeout(150);
  }
  await page.keyboard.press('Escape').catch(() => {});
  return listed(offered);
}

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

/** The composer panel. */
function composer(page) {
  return page.locator('#reply-control');
}

/** Whether the composer is open (not closed, not minimised to its draft bar). */
async function composerOpen(page) {
  return page.locator('#reply-control.open, #reply-control.saving').count().then((n) => n > 0).catch(() => false);
}

/** Wait for the composer to open; a failure says what is on screen. */
async function waitForComposer(world, what = 'the composer') {
  await eventually(world, () => composerOpen(world.page), Boolean, async () => ({
    message: `${what} did not open: ${await pageSummary(world)}.`,
    hint: 'The button that opens the composer is shown to an account that may write here; a visitor, or a topic that is closed, has none.',
  }), 10000);
}

/** The editor of the composer: the Markdown textarea, or the rich text editor (ProseMirror). */
async function editor(page) {
  const markdown = page.locator('#reply-control textarea.d-editor-input');
  if (await markdown.isVisible().catch(() => false)) return { kind: 'markdown', locator: markdown };
  const rich = page.locator('#reply-control .ProseMirror.d-editor-input, #reply-control [contenteditable="true"].d-editor-input');
  return { kind: 'rich', locator: rich.first() };
}

/** Replace the text of the composer's editor. */
async function writeInComposer(world, text) {
  const { locator } = await editor(world.page);
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.fill(text);
}

/** The text of the composer's editor. */
async function composerText(page) {
  const { kind, locator } = await editor(page);
  if (kind === 'markdown') return clean(await locator.inputValue().catch(() => ''));
  return clean(await locator.innerText().catch(() => ''));
}

/** The composer's editor in Markdown, with its preview shown. */
async function markdownWithPreview(world) {
  const page = world.page;
  const { kind } = await editor(page);
  if (kind === 'rich') {
    const toggle = page.locator('#reply-control .composer-toggle-switch');
    // The forum keeps the editor an account chose (PUT /u/<username>.json composition_mode=0): it is
    // given back the rich text editor after the scenario.
    await withRequest(world, (m, u) => m === 'PUT' && /\/u\/[^/]+\.json$/.test(new URL(u).pathname), () => press(toggle), { required: false, startWindow: 3000, what: 'the editor of the account' });
    await page.locator('#reply-control textarea.d-editor-input').waitFor({ state: 'visible', timeout: 5000 });
    const handle = world.__forumUser;
    if (handle && cleansUp(world)) {
      afterScenario(world, `composition-mode:${handle}`, async () => {
        const client = await apiAs(world, handle);
        await client.call('PUT', `/u/${client.account.username}.json`, { composition_mode: '1' });
      });
    }
  }
  if (await page.locator('#reply-control.hide-preview').count()) {
    const show = page.locator('#reply-control button[title="show preview"], #reply-control button[aria-label="show preview"], #reply-control .toggle-preview').first();
    if (await show.isVisible().catch(() => false)) await press(show);
  }
}

/** Add a text at the end of the composer's editor (after a quotation, for example). */
async function addToComposer(world, text) {
  const page = world.page;
  const { kind, locator } = await editor(page);
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  if (kind === 'markdown') {
    await locator.focus();
    await locator.evaluate((ta) => { ta.selectionStart = ta.selectionEnd = ta.value.length; });
    await page.keyboard.insertText(`\n\n${text}`);
  } else {
    // No click in the editor: a click lands on whatever is in its middle, and a click on a quotation or
    // an image selects that block. The caret goes to the end of the text, in the empty paragraph the
    // editor keeps after a quotation when there is one, or in a new paragraph.
    const endsEmpty = await locator.evaluate((el) => {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const last = el.lastElementChild;
      return !!(last && last.tagName === 'P' && last.textContent.trim() === '');
    });
    await page.keyboard.press('ControlOrMeta+End');
    if (!endsEmpty) await page.keyboard.press('Enter');
    await page.keyboard.insertText(text);
  }
}

/** The messages the composer shows about what it refuses (its tips over the title and the body), and the forum's error dialog. */
async function composerErrors(page) {
  const tips = await page.locator('#reply-control .popup-tip.bad').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.textContent.replace(/\s+/g, ' ').trim())).catch(() => []);
  const dialog = await errorDialogText(page);
  return [...tips, dialog].map(clean).filter(Boolean);
}

/**
 * Submit the composer and wait for the forum's answer (POST /posts). Returns
 * { status, json, errors }: a refusal (the composer's own check before it sends
 * anything, or the forum's answer) is not thrown here, the step decides.
 */
async function submitComposer(world) {
  const page = world.page;
  const button = page.locator('#reply-control button.create').first();
  const response = await withRequest(world, (m, u) => m === 'POST' && /^\/posts(\.json)?$/.test(new URL(u).pathname), () => press(button), { required: false, startWindow: 4000, what: 'the post the composer sends (POST /posts)' });
  if (!response) {
    const tips = await composerErrors(page);
    if (tips.length) return { status: 0, json: null, errors: tips };
    throw fail(world, 'The composer sent nothing and shows no message.', 'The submit button of the composer may be disabled while it uploads or saves; look at the screenshot of the failure.');
  }
  const json = await jsonOf(response);
  const errors = errorsOf(json);
  if (!errors.length && response.status() < 400) {
    await eventually(world, async () => !(await composerOpen(page)), Boolean, async () => ({ message: 'The composer stayed open after the forum took the post.', hint: 'Look at the screenshot of the failure for a message of the composer.' }), 10000).catch(() => {});
    await forumReady(world);
  } else {
    await page.locator('.dialog-container .dialog-body').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  }
  return { status: response.status(), json, errors };
}

/** Discard what the composer holds: its "Discard" button, and the confirmation when it asks. The draft goes too. */
async function discardComposer(world) {
  const page = world.page;
  if (!(await composerOpen(page))) return;
  await press(page.locator('#reply-control button.discard-button').first());
  const confirm = page.locator('.d-modal button.discard-draft-modal__discard-btn, .d-modal button.btn-danger').first();
  if (await confirm.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) await confirm.click();
  await eventually(world, async () => !(await composerOpen(page)), Boolean, async () => ({ message: 'The composer stayed open after "Discard".', hint: 'The forum asks "Do you want to discard your post?" before it discards a text.' }), 8000);
  await forumReady(world);
}

module.exports = {
  CUT_HINT,
  XHR_HEADERS,
  absolute,
  addToComposer,
  afterScenario,
  apiAs,
  budget,
  categories,
  categoryNamed,
  choose,
  clean,
  cleansUp,
  closeErrorDialog,
  composer,
  composerErrors,
  composerOpen,
  composerText,
  count,
  currentPath,
  currentUsername,
  cutRequest,
  dataAdmin,
  deletePostAfter,
  deleteTopicAfter,
  discardComposer,
  dropSession,
  editor,
  errorDialogText,
  errorsOf,
  eventually,
  fail,
  forgetBrowserSession,
  forumReady,
  heading,
  instrument,
  isLongPoll,
  jsonOf,
  keepSession,
  listed,
  loginAs,
  markdownWithPreview,
  mentions,
  normal,
  open,
  openDialog,
  postsRead,
  openMenu,
  pageSummary,
  press,
  quotedList,
  resolveUser,
  runCleanups,
  same,
  siteRoot,
  stamp,
  submitComposer,
  toMiddle,
  topicsTitled,
  usernameOf,
  waitForComposer,
  withCut,
  withRequest,
  writeInComposer,
};
