'use strict';

// The session: logging in by a handle of the users registry or through the
// login form, a refused login, a visitor, logging out, and who is signed in.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');

/**
 * Log in as an account of the users registry (worldParameters.users), then open
 * the forum's home page. An account that logged in earlier in the run gets its
 * session back; otherwise it logs in through the forum's own session endpoint,
 * the request the login form sends.
 *
 * Example #1: Given I am a logged in user with the "member" user
 * Example #2: Given I am a logged in user with the "moderator" user
 * Example #3: Given I am a logged in user with the "administrator" user
 * Example #4: Given I am a logged in user with the "newuser" user
 * Example #5: Given we are a logged in user with the "member" user
 */
Given(/^(?:I am|we are) a logged in user with the "([^"]*)" user$/, async function (handle) {
  await h.loginAs(this, handle, '/');
});

/**
 * Make the browser a visitor of the forum: its session cookies are dropped (the
 * account's session on the server lives on for a later scenario), then the
 * home page opens.
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: When I am not logged in
 * Example #4: Given I am not logged in
 *               And I go to "/latest"
 * Example #5: Given I am not logged in
 *               Then I should not be logged in
 */
Given(/^(?:I am|we are) not logged in$/, async function () {
  await h.forgetBrowserSession(this);
  await h.open(this, '/');
});

/**
 * Open the login page, fill it in and send it. The forum answers the login
 * request (POST /session), then reloads the page on success (the answer's body
 * goes with the old page) or shows its refusal above the form. Returns
 * { username, errors }: the account the forum knows after it, and the refusal.
 */
async function loginWithForm(world, login, password) {
  const page = world.page;
  await h.forgetBrowserSession(world);
  await h.open(world, '/login');
  const field = page.getByRole('textbox', { name: 'Email / Username' });
  if (!(await field.isVisible().catch(() => false))) {
    throw h.fail(world, `The login page shows no "Email / Username" field: ${await h.pageSummary(world)}.`, 'The forum shows its login form at /login to a visitor; a forum that logs in elsewhere (an outside sign-in) is not covered by this step.');
  }
  await field.fill(login);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  const reloaded = page.waitForEvent('load', { timeout: h.budget(world) }).then(() => 'reloaded').catch(() => 'stayed');
  const answer = await h.withRequest(world, (m, u) => m === 'POST' && /^\/session(\.json)?$/.test(new URL(u).pathname), () => page.getByRole('button', { name: 'Log In', exact: true }).click(), { what: 'the login (POST /session)' });
  const json = await h.jsonOf(answer).catch(() => null);
  const refusal = page.locator('.alert.alert-error:visible').first();
  const outcome = await Promise.race([
    reloaded,
    refusal.waitFor({ state: 'visible', timeout: h.budget(world) }).then(() => 'refused').catch(() => 'stayed'),
  ]);
  await h.forumReady(world);
  const errors = h.errorsOf(json);
  if (outcome === 'refused' && !errors.length) errors.push(h.clean(await refusal.innerText().catch(() => '')));
  return { username: await h.currentUsername(world), errors: errors.filter(Boolean) };
}

/**
 * Log in through the forum's login page as an account of the users registry,
 * with its username and password, as a person does.
 *
 * Example #1: When I log in as "member" with the login form
 * Example #2: When I log in as "moderator" with the login form
 * Example #3: When I log in as "administrator" with the login form
 * Example #4: When I log in as "newuser" with the login form
 * Example #5: When we log in as "member" with the login form
 */
When(/^(?:I|we) log in as "([^"]*)" with the login form$/, async function (handle) {
  const account = h.resolveUser(this, handle);
  const { username, errors } = await loginWithForm(this, account.login, account.password);
  if (!h.same(username, account.username)) {
    throw h.fail(this, `The login of "${handle}" (${account.login}) did not log the browser in${errors.length ? `: the forum says "${errors.join(' ')}"` : ` (the forum knows it as ${username || 'a visitor'})`}.`, 'Check the username and the password of the account in worldParameters.users of cucumber.js; the build of the site makes the accounts.');
  }
  await h.keepSession(this, account);
});

/**
 * Fill the login form in with a username (or email) and a password, and send it,
 * for a login the forum must refuse. Nothing is remembered.
 *
 * Example #1: When I log in with the username "member" and the password "Wrong-password-1"
 * Example #2: When I log in with the username "nobody" and the password "Some-password-1"
 * Example #3: When I log in with the username "member@example.com" and the password "Wrong-password-1"
 * Example #4: When I log in with the username "" and the password ""
 * Example #5: When we log in with the username "moderator" and the password "Not-the-password-9"
 */
When(/^(?:I|we) log in with the username "([^"]*)" and the password "([^"]*)"$/, async function (login, password) {
  this.__forumLoginAnswer = await loginWithForm(this, login, password);
});

/**
 * The login page shows the forum's refusal, with its message.
 *
 * Example #1: Then the login should be refused with "Incorrect username, email or password"
 * Example #2: Then the login should be refused with "Incorrect username"
 * Example #3: Then the login should be refused with "Incorrect username, email or password"
 *               And I should not be logged in
 * Example #4: Then the login should be refused with "email or password"
 * Example #5: Then the login should be refused with "Please enter your email or username"
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (expected) {
  const page = this.page;
  const shown = await h.eventually(this, async () => {
    const alerts = await page.locator('.alert.alert-error:visible, #modal-alert:visible, .login-modal-body .alert:visible, .login-page .alert:visible').allInnerTexts().catch(() => []);
    const answer = (this.__forumLoginAnswer && this.__forumLoginAnswer.errors) || [];
    return [...alerts, ...answer].map(h.clean).filter(Boolean);
  }, (texts) => texts.some((t) => h.mentions(t, expected)), async (texts) => ({
    message: `The login page does not show "${expected}". It shows ${h.listed(texts)}.`,
    hint: 'The forum answers a refused login with a message above the form (.alert-error); look at the screenshot of the failure.',
  }), 8000);
  return shown;
});

/**
 * Log out through the user menu: the avatar, the "Profile" tab, "Log Out". The
 * forum ends the session and reloads its home page.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: When I log out
 *               And I go to "/login"
 * Example #5: When I log out
 *               Then I should see "Log In"
 */
When(/^(?:I|we) log out$/, async function () {
  const page = this.page;
  const username = await h.currentUsername(this);
  if (!username) throw h.fail(this, 'Nobody is logged in, so there is nobody to log out.', 'Log in first, with "Given I am a logged in user with the "member" user".');
  await openUserMenu(this);
  await h.press(page.locator('.user-menu').getByRole('tab', { name: 'Profile' }));
  const reloaded = page.waitForEvent('load', { timeout: h.budget(this) }).catch(() => null);
  await h.withRequest(this, (m, u) => m === 'DELETE' && /\/session\//.test(new URL(u).pathname), () => h.press(page.locator('.user-menu').getByRole('button', { name: 'Log Out' })), { what: 'the logout (DELETE /session)' });
  await reloaded;
  await h.forumReady(this);
  h.dropSession(this, username);
  this.__forumUser = null;
});

/** Open the user menu of the header (the avatar button "Notifications and account"). */
async function openUserMenu(world) {
  const page = world.page;
  if (await page.locator('.user-menu.revamped').isVisible().catch(() => false)) return;
  const button = page.locator('#toggle-current-user');
  if (!(await button.isVisible().catch(() => false))) {
    throw h.fail(world, `The header has no avatar button ("Notifications and account"): ${await h.pageSummary(world)}.`, 'The user menu belongs to a logged-in account; log in first.');
  }
  await h.press(button);
  await page.locator('.user-menu.revamped').waitFor({ state: 'visible', timeout: 10000 });
  await h.forumReady(world);
}

/**
 * The forum knows the browser as a logged-in account (any, or the one of a
 * handle of the users registry), and the header shows its avatar button.
 *
 * Example #1: Then I should be logged in
 * Example #2: Then I should be logged in as "member"
 * Example #3: Then I should be logged in as "moderator"
 * Example #4: Then we should be logged in as "administrator"
 * Example #5: Then I should be logged in as "newuser"
 */
Then(/^(?:I|we) should be logged in(?: as "([^"]*)")?$/, async function (handle) {
  const username = await h.currentUsername(this);
  if (!username) throw h.fail(this, `The forum does not know the browser as a logged-in account: ${await h.pageSummary(this)}.`, 'Log in first, or check the screenshot of the failure for the forum\'s refusal.');
  if (handle) {
    const wanted = h.resolveUser(this, handle).username;
    if (!h.same(username, wanted)) throw friendly({ message: `The browser is logged in as ${username}, not as ${wanted} ("${handle}").`, hint: 'An earlier step logged another account in; "Given I am a logged in user with the ... user" switches accounts.' });
  }
  await this.page.locator('#toggle-current-user').waitFor({ state: 'visible', timeout: 10000 }).catch(async () => {
    throw h.fail(this, `The forum knows the browser as ${username}, but the header shows no avatar button: ${await h.pageSummary(this)}.`, 'Reload the page: the header shows the account after a login reloads the page.');
  });
});

/**
 * The browser is a visitor: the forum knows no account, and the header offers
 * "Log In".
 *
 * Example #1: Then I should not be logged in
 * Example #2: Then we should not be logged in
 * Example #3: And I should not be logged in
 * Example #4: But I should not be logged in
 * Example #5: Then I should not be logged in
 *               And I should see "Log In"
 */
Then(/^(?:I|we) should not be logged in$/, async function () {
  const username = await h.currentUsername(this);
  if (username) throw friendly({ message: `The browser is still logged in as ${username}.`, hint: 'A logout ends the session; "Given I am not logged in" makes the browser a visitor.' });
  await this.page.getByRole('button', { name: 'Log In' }).first().waitFor({ state: 'visible', timeout: 10000 }).catch(async () => {
    throw h.fail(this, `The forum knows no account, but the header offers no "Log In" button: ${await h.pageSummary(this)}.`, 'The page may still be loading, or the forum shows its login page itself (a forum that asks every visitor to log in).');
  });
});

/**
 * The page on screen is the forum's login page.
 *
 * Example #1: Then I should be on the login page
 * Example #2: Then we should be on the login page
 * Example #3: And I should be on the login page
 * Example #4: But I should be on the login page
 * Example #5: Then I should be on the login page
 *               And I should see "Welcome back"
 */
Then(/^(?:I|we) should be on the login page$/, async function () {
  await h.forumReady(this);
  const ok = await this.page.getByRole('textbox', { name: 'Email / Username' }).isVisible().catch(() => false);
  if (!ok) throw h.fail(this, `The page is not the login page: ${await h.pageSummary(this)}.`, 'The login page has the fields "Email / Username" and "Password"; it is at /login.');
});

module.exports = { openUserMenu };
