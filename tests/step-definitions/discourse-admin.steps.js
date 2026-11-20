'use strict';

// The admin: the dashboard, the site settings and their search, and the pages an
// account may not open.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');

/**
 * Open the admin dashboard.
 *
 * Example #1: When I go to the admin dashboard
 * Example #2: When we go to the admin dashboard
 * Example #3: When I go to the admin dashboard
 *               Then the admin dashboard should show "Reports"
 * Example #4: When I go to the admin dashboard
 *               Then the admin dashboard should show "Site traffic"
 * Example #5: When I go to the admin dashboard
 *               Then I should see "Dashboard"
 */
When(/^(?:I|we) go to the admin dashboard$/, async function () {
  await h.open(this, '/admin');
  if (!(await this.page.locator('#main-outlet .admin-contents, #main-outlet .dashboard, .admin-main-nav, .admin-sidebar').first().isVisible().catch(() => false))) {
    throw h.fail(this, `The admin dashboard did not open: ${await h.pageSummary(this)}.`, 'The admin is an admin\'s; another account gets "Oops! That page doesn’t exist or is private.".');
  }
});

/**
 * The admin dashboard shows a section by its heading ("Highlights", "Reports",
 * "Site traffic", "Engagement", "Search").
 *
 * Example #1: Then the admin dashboard should show "Site traffic"
 * Example #2: Then the admin dashboard should show "Engagement"
 * Example #3: Then the admin dashboard should show "Reports"
 * Example #4: Then the admin dashboard should show "Highlights"
 * Example #5: Then the admin dashboard should show "Search"
 */
Then(/^the admin dashboard should show "([^"]*)"$/, async function (section) {
  const page = this.page;
  await h.forumReady(this);
  await h.eventually(this, () => page.locator('#main-outlet h1, #main-outlet h2, #main-outlet h3').allInnerTexts().catch(() => []), (texts) => texts.some((t) => h.same(t, section)), async (texts) => ({
    message: `The admin dashboard shows no section "${section}". It shows ${h.listed(texts, 15)}.`,
    hint: 'The dashboard\'s sections are named by their headings.',
  }), 10000);
});

/**
 * Search the site settings: the admin's "All site settings" page, its filter
 * field, and the "All" category of the results.
 *
 * Example #1: When I search the site settings for "title"
 * Example #2: When I search the site settings for "rate limit"
 * Example #3: When we search the site settings for "min password length"
 * Example #4: When I search the site settings for "tagging"
 * Example #5: When I search the site settings for "nothing is called like this"
 */
When(/^(?:I|we) search the site settings for "([^"]*)"$/, async function (words) {
  const page = this.page;
  if (!/^\/admin\/site_settings/.test(h.currentPath(this))) await h.open(this, '/admin/site_settings');
  const filter = page.locator('#setting-filter').first();
  if (!(await filter.isVisible().catch(() => false))) throw h.fail(this, `The site settings page has no filter field: ${await h.pageSummary(this)}.`, 'The site settings are an admin\'s.');
  await filter.fill(words);
  const all = page.locator('.admin-site-settings-category-nav__item.all_results a').first();
  await all.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await all.isVisible().catch(() => false)) await h.press(all);
  await h.forumReady(this);
});

/** The site settings the page on screen shows: [{ name, label, value }]. */
async function shownSettings(page) {
  return page.locator('#main-outlet .row.setting[data-setting]').evaluateAll((rows) => rows.filter((r) => r.getClientRects().length).map((r) => {
    const input = r.querySelector('.setting-value input[type="text"], .setting-value input[type="number"], .setting-value textarea');
    const box = r.querySelector('.setting-value input[type="checkbox"]');
    return {
      name: r.getAttribute('data-setting'),
      label: ((r.querySelector('.setting-label h3') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      value: input ? input.value : (box ? (box.checked ? 'true' : 'false') : ((r.querySelector('.setting-value') || {}).textContent || '').replace(/\s+/g, ' ').trim()),
    };
  }));
}

/**
 * The site settings on screen list a setting, by its name or its label, and
 * how many they list.
 *
 * Example #1: Then the site settings should list "title"
 * Example #2: Then the site settings should list "Min password length"
 * Example #3: Then the site settings should list "rate_limit_create_post"
 * Example #4: Then the site settings should list no setting
 * Example #5: Then the site settings should list "tagging_enabled"
 */
Then(/^the site settings should list (?:"([^"]*)"|no setting)$/, async function (name) {
  const page = this.page;
  if (name == null) {
    await h.eventually(this, () => shownSettings(page), (l) => l.length === 0, async (l) => ({ message: `The site settings list ${l.length} settings: ${h.listed(l.map((s) => s.name))}.`, hint: 'The filter finds a setting by words of its name, its label or its description.' }), 8000);
    return;
  }
  await h.eventually(this, () => shownSettings(page), (l) => l.some((s) => h.same(s.name, name) || h.same(s.label, name)), async (l) => ({
    message: `The site settings do not list "${name}". They list ${h.listed(l.map((s) => s.name), 15)}.`,
    hint: 'Search the settings first ("When I search the site settings for "..."").',
  }), 8000);
});

/**
 * The value of a site setting on screen, by its name or its label.
 *
 * Example #1: Then the site setting "title" should be "Webship test forum"
 * Example #2: Then the site setting "min_topic_title_length" should be "15"
 * Example #3: Then the site setting "Min post length" should be "20"
 * Example #4: Then the site setting "tagging_enabled" should be "true"
 * Example #5: Then the site setting "Title" should be "Webship test forum"
 */
Then(/^the site setting "([^"]*)" should be "([^"]*)"$/, async function (name, expected) {
  const page = this.page;
  await h.eventually(this, () => shownSettings(page), (l) => l.some((s) => (h.same(s.name, name) || h.same(s.label, name)) && h.same(s.value, expected)), async (l) => {
    const s = l.find((x) => h.same(x.name, name) || h.same(x.label, name));
    return {
      message: s ? `The site setting "${name}" is "${s.value}", not "${expected}".` : `The site settings on screen do not show "${name}". They show ${h.listed(l.map((x) => x.name), 15)}.`,
      hint: 'Search the settings for the setting first.',
    };
  }, 8000);
});

/**
 * The account the browser is logged in as (or a visitor) may not open an
 * address of the forum: the forum answers with its "page doesn't exist or is
 * private" page, or "You're not allowed to view that".
 *
 * Example #1: Then I should not be allowed to open "/admin"
 * Example #2: Then I should not be allowed to open "/review"
 * Example #3: Then I should not be allowed to open "/admin/site_settings"
 * Example #4: Then we should not be allowed to open "/admin/users/list/active"
 * Example #5: Then I should not be allowed to open "/u/moderator/messages"
 */
Then(/^(?:I|we) should not be allowed to open "([^"]*)"$/, async function (path) {
  const page = this.page;
  await h.open(this, path);
  const refused = async () => {
    const title = await page.title().catch(() => '');
    const text = h.clean(await page.locator('#main-outlet, body').first().innerText({ timeout: 2000 }).catch(() => ''));
    return /page not found/i.test(title) || /doesn.t exist or is private|not allowed to view that|access denied|you are not permitted/i.test(text) ? text.slice(0, 120) : '';
  };
  await h.eventually(this, refused, Boolean, async () => ({
    message: `The forum let the account open ${path}: ${await h.pageSummary(this)}.`,
    hint: 'The forum refuses the admin and the review queue to an account that is not staff, with "Oops! That page doesn’t exist or is private." or "You\'re not allowed to view that.".',
  }), 10000);
});

module.exports = {};
