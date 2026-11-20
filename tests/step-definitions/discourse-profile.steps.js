'use strict';

// The profile of an account and the preferences of the account the browser is
// logged in as: a preference by its label, saving, and what the profile shows.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');

/**
 * Open the profile of an account (its summary), by a handle of the users
 * registry or a username.
 *
 * Example #1: When I open the profile of "member"
 * Example #2: When I open the profile of "moderator"
 * Example #3: When we open the profile of "administrator"
 * Example #4: When I open the profile of "newuser"
 * Example #5: When I open the profile of "member"
 *               Then the profile should show the name "Member Webship"
 */
When(/^(?:I|we) open the profile of "([^"]*)"$/, async function (who) {
  await h.open(this, `/u/${h.usernameOf(this, who)}/summary`);
});

/**
 * The profile on screen shows the account's username or full name.
 *
 * Example #1: Then the profile should show the name "Member Webship"
 * Example #2: Then the profile should show the username "member"
 * Example #3: Then the profile should show the name "Moderator Webship"
 * Example #4: Then the profile should show the username "moderator"
 * Example #5: Then the profile should show the name "New User Webship"
 */
Then(/^the profile should show the (name|username) "([^"]*)"$/, async function (kind, expected) {
  const page = this.page;
  const selector = kind === 'name' ? '.user-profile-names__secondary, .user-profile-names .full-name' : '.user-profile-names__primary, .user-profile-names .username';
  await h.forumReady(this);
  await h.eventually(this, () => page.locator(selector).allInnerTexts().catch(() => []), (texts) => texts.some((t) => h.same(t, kind === 'username' ? h.usernameOf(this, expected) : expected)), async (texts) => ({
    message: `The profile does not show the ${kind} "${expected}". It shows ${h.listed(texts)}${texts.length ? '' : ` (${await h.pageSummary(this)})`}.`,
    hint: 'The profile shows the username first and the full name under it.',
  }), 8000);
});

/**
 * The profile on screen shows a text in its details or statistics (the
 * location, "read time", a title); its header is expanded first when it is
 * folded, as a person does to read the location.
 *
 * Example #1: Then the profile should show "Amman test office"
 * Example #2: Then the profile should show "read time"
 * Example #3: Then the profile should show "posts created"
 * Example #4: Then the profile should show "days visited"
 * Example #5: Then the profile should show "Moderator"
 */
Then(/^the profile should show "([^"]*)"$/, async function (expected) {
  const page = this.page;
  await h.forumReady(this);
  // The profile's header starts folded: its location, website and "About me" show once it is expanded.
  const expand = page.locator('#main-outlet .user-main section.controls button', { hasText: 'Expand' }).first();
  if (await expand.isVisible().catch(() => false)) {
    await h.press(expand);
    await page.locator('#main-outlet .user-main .collapsed-info').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await h.forumReady(this);
  }
  await h.eventually(this, () => page.locator('#main-outlet .user-main, #main-outlet .user-content').allInnerTexts().catch(() => []), (texts) => texts.some((t) => h.mentions(t, expected)), async () => ({
    message: `The profile does not show "${expected}": ${await h.pageSummary(this)}.`,
    hint: 'The profile shows the account\'s location, website and statistics on its summary.',
  }), 8000);
});

/**
 * Open a page of the preferences of the account the browser is logged in as
 * ("Account", "Profile", "Emails", "Notifications", "Tracking", "Interface").
 *
 * Example #1: When I go to my "Profile" preferences
 * Example #2: When I go to my "Interface" preferences
 * Example #3: When I go to my "Notifications" preferences
 * Example #4: When we go to my "Account" preferences
 * Example #5: When I go to my "Emails" preferences
 */
When(/^(?:I|we) go to my "([^"]*)" preferences$/, async function (tab) {
  const username = await h.currentUsername(this);
  if (!username) throw h.fail(this, 'Nobody is logged in, so there are no preferences to open.', 'Log in first.');
  await h.open(this, `/u/${username}/preferences/${h.normal(tab).replace(/\s+/g, '-')}`);
  if (!(await this.page.locator('#main-outlet .user-preferences, #main-outlet form.user-preferences, #main-outlet .control-group').first().isVisible().catch(() => false))) {
    throw h.fail(this, `The preferences page "${tab}" did not open: ${await h.pageSummary(this)}.`, 'The preferences pages are Account, Security, Profile, Emails, Notifications, Tracking, Users, Interface, Navigation menu.');
  }
});

/** The field of a preference by its label (its control group): { group, field, kind }, or a friendly failure. */
async function preference(world, label) {
  const page = world.page;
  const groups = page.locator('#main-outlet .control-group');
  const n = await groups.count();
  const labels = [];
  for (let i = 0; i < n; i += 1) {
    const g = groups.nth(i);
    if (!(await g.isVisible().catch(() => false))) continue;
    const text = h.clean(await g.locator('.control-label, label, legend, h3').first().innerText({ timeout: 500 }).catch(() => ''));
    labels.push(text);
    if (h.same(text, label)) {
      const field = g.locator('textarea, input[type="text"], input[type="url"], input:not([type]), select').first();
      if (await field.count()) return { group: g, field, kind: 'text' };
      const box = g.locator('input[type="checkbox"]').first();
      if (await box.count()) return { group: g, field: box, kind: 'checkbox' };
    }
  }
  throw friendly({ message: `The preferences page has no "${label}". It has ${h.listed(labels, 20)}.`, hint: 'Name a preference by the label over its field, as the page shows it.' });
}

/**
 * Change a preference of the page on screen by its label (a text field, or a
 * box to tick: "yes" / "no"); "When I save my preferences" saves it. The value
 * it had is put back after the scenario.
 *
 * Example #1: When I set the preference "Location" to "Amman test office"
 * Example #2: When I set the preference "Web Site" to "https://example.com"
 * Example #3: When I set the preference "About me" to "I test the forum with the suite."
 * Example #4: When we set the preference "Location" to "A test office"
 * Example #5: When I set the preference "Hide my public profile" to "no"
 */
When(/^(?:I|we) set the preference "([^"]*)" to "([^"]*)"$/, async function (label, value) {
  const { field, kind } = await preference(this, label);
  const username = await h.currentUsername(this);
  const before = kind === 'checkbox' ? await field.isChecked() : await field.inputValue();
  if (kind === 'checkbox') {
    const want = /^(yes|true|on|1)$/i.test(value);
    if ((await field.isChecked()) !== want) await h.press(field);
  } else {
    await field.fill(value);
  }
  const handle = this.__forumUser;
  if (h.cleansUp(this) && handle && username) {
    h.afterScenario(this, `preference:${username}:${label}`, async () => {
      const client = await h.apiAs(this, handle);
      const keys = { location: 'location', 'web site': 'website', website: 'website', 'about me': 'bio_raw' };
      const key = keys[h.normal(label)];
      if (key) await client.call('PUT', `/u/${username}.json`, { [key]: String(before) });
    });
  }
});

/**
 * Save the preferences page on screen ("Save Changes"); the step waits for the
 * forum's answer and its "Saved!".
 *
 * Example #1: When I save my preferences
 * Example #2: When we save my preferences
 * Example #3: And I save my preferences
 * Example #4: When I save my preferences
 *               Then I should see "Saved!"
 * Example #5: When I save my preferences
 *               Then the preference "Location" should be "Amman test office"
 */
When(/^(?:I|we) save my preferences$/, async function () {
  const page = this.page;
  const button = page.locator('#main-outlet button.save-changes').first();
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, 'The page has no "Save Changes" button.', 'Open a preferences page first.');
  const response = await h.withRequest(this, (m, u) => m === 'PUT' && /\/u\/[^/]+(\.json)?$/.test(new URL(u).pathname), () => h.press(button), { what: 'the preferences (PUT /u/<username>)' });
  if (response.status() >= 400) {
    const json = await h.jsonOf(response);
    throw friendly({ message: `The forum refused the preferences: ${h.errorsOf(json).join(' ') || `status ${response.status()}`}.`, hint: 'Look at the screenshot of the failure for the field the forum names.' });
  }
  await page.locator('#main-outlet .saved').first().waitFor({ state: 'visible', timeout: 8000 }).catch(async () => {
    throw h.fail(this, 'The preferences page did not say "Saved!".', 'The forum says "Saved!" beside the button once it took the change.');
  });
  await h.forumReady(this);
});

/**
 * A preference of the page on screen has a value (a text field), or is ticked
 * ("yes" / "no").
 *
 * Example #1: Then the preference "Location" should be "Amman test office"
 * Example #2: Then the preference "Web Site" should be "https://example.com"
 * Example #3: Then the preference "About me" should be "I test the forum with the suite."
 * Example #4: Then the preference "Location" should be ""
 * Example #5: Then the preference "Hide my public profile" should be "no"
 */
Then(/^the preference "([^"]*)" should be "([^"]*)"$/, async function (label, expected) {
  const { field, kind } = await preference(this, label);
  const read = async () => (kind === 'checkbox' ? ((await field.isChecked()) ? 'yes' : 'no') : await field.inputValue());
  await h.eventually(this, read, (v) => (kind === 'checkbox' ? h.same(v, /^(yes|true|on|1)$/i.test(expected) ? 'yes' : 'no') : h.same(v, expected)), async (v) => ({
    message: `The preference "${label}" is "${v}", not "${expected}".`,
    hint: 'A preference keeps its value once saved ("When I save my preferences").',
  }), 8000);
});

module.exports = {};
