'use strict';

// Search: the quick search of the header (or of the welcome banner on a topic
// list), the full-page search with its count, its results and its advanced
// filters.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');

/** The topics of the quick search's open results. */
async function quickResults(page) {
  return page.locator('.search-menu .results .search-result-topic .topic-title').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
}

/** The topics of the full-page search's results. */
async function pageResults(page) {
  return page.locator('#main-outlet .fps-result').evaluateAll((els) => els.map((r) => ((r.querySelector('.topic-title') || r.querySelector('.search-link') || r).textContent || '').replace(/\s+/g, ' ').trim()));
}

/**
 * Search with the quick search: the search field of the welcome banner on a
 * topic list, or the header's search button elsewhere; the words are typed and
 * Enter pressed, and the step waits for the forum's results.
 *
 * Example #1: When I search for "backups"
 * Example #2: When I search for "keyboard shortcuts"
 * Example #3: When we search for "laptop"
 * Example #4: When I search for "zeppelin"
 * Example #5: When I search for "nothing matches these words"
 */
When(/^(?:I|we) search for "([^"]*)"$/, async function (words) {
  const page = this.page;
  await h.forumReady(this);
  let input = page.locator('#welcome-banner-search-input').first();
  if (!(await input.isVisible().catch(() => false))) {
    input = page.locator('.d-header #search-term, .d-header .search-menu input[type="search"]').first();
    if (!(await input.isVisible().catch(() => false))) {
      const button = page.locator('.d-header #search-button, .d-header button.search-dropdown, .d-header').getByRole('button', { name: 'Search' }).first();
      if (!(await button.isVisible().catch(() => false))) throw h.fail(this, `The page offers no search field and no search button: ${await h.pageSummary(this)}.`, 'The forum shows its search in the welcome banner of a topic list, and as a button in the header elsewhere.');
      await h.press(button);
      input = page.locator('.search-menu input[type="search"], #search-term').first();
      await input.waitFor({ state: 'visible', timeout: 8000 });
    }
  }
  await input.click();
  await input.fill(words);
  await h.withRequest(this, (m, u) => m === 'GET' && /\/search\/query/.test(u) && !/type_filter=exclude_topics/.test(u), () => input.press('Enter'), { what: 'the search (GET /search/query)' });
  await h.forumReady(this);
});

/**
 * The quick search's results show (or do not show) a topic by its title.
 *
 * Example #1: Then the quick search should show "Where are the nightly backups kept"
 * Example #2: Then the quick search should show "Favourite keyboard shortcuts of the team"
 * Example #3: Then the quick search should not show "How to install the product on a laptop"
 * Example #4: Then the quick search should show "A topic for the search to find"
 * Example #5: Then the quick search should not show "Where are the nightly backups kept"
 */
Then(/^the quick search should (not )?show "([^"]*)"$/, async function (not, title) {
  const page = this.page;
  if (not) {
    const list = await quickResults(page);
    if (list.some((t) => h.same(t, title))) throw friendly({ message: `The quick search shows "${title}".`, hint: 'The quick search shows the topics whose posts match every word.' });
    return;
  }
  await h.eventually(this, () => quickResults(page), (list) => list.some((t) => h.same(t, title)), async (list) => ({
    message: `The quick search does not show "${title}". It shows ${h.listed(list)}.`,
    hint: 'The quick search shows topics after Enter (as you type it suggests tags, categories and accounts only).',
  }), 10000);
});

/**
 * Search on the full search page for some words (its own field and its Search
 * button); the step waits for the forum's results.
 *
 * Example #1: When I search the full page for "backups"
 * Example #2: When I search the full page for "keyboard"
 * Example #3: When I search the full page for "nothing matches these words"
 * Example #4: When we search the full page for "laptop"
 * Example #5: When I search the full page for "zeppelin"
 */
When(/^(?:I|we) search the full page for "([^"]*)"$/, async function (words) {
  const page = this.page;
  if (!/^\/search/.test(h.currentPath(this))) await h.open(this, '/search?expanded=true');
  const input = page.locator('#main-outlet input.full-page-search').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(words);
  await runFullSearch(this);
});

/** Press the full search page's Search button and wait for the forum's results. */
async function runFullSearch(world) {
  const page = world.page;
  await h.withRequest(world, (m, u) => m === 'GET' && /^\/search(\.json)?$/.test(new URL(u).pathname), () => h.press(page.locator('#main-outlet button.search-cta').first()), { what: 'the search (GET /search)' });
  await h.forumReady(world);
}

/**
 * Narrow the full-page search with one of its advanced filters, then search
 * again: a category ("Categorized"), a tag ("Tagged"), an author ("Posted by",
 * a handle of the users registry or a username).
 *
 * Example #1: When I filter the search by the category "Support"
 * Example #2: When I filter the search by the tag "howto"
 * Example #3: When I filter the search by the author "member"
 * Example #4: When we filter the search by the category "Off-topic"
 * Example #5: When I filter the search by the author "moderator"
 */
When(/^(?:I|we) filter the search by the (category|tag|author) "([^"]*)"$/, async function (kind, value) {
  const page = this.page;
  if (!/^\/search/.test(h.currentPath(this))) throw h.fail(this, 'The page is not the full search page.', 'Search the full page first: "When I search the full page for "..."".');
  const groups = { category: '.advanced-search-category', tag: '.advanced-search-tags', author: '.advanced-search-posted-by' };
  let group = page.locator(`#main-outlet ${groups[kind]}`).first();
  if (!(await group.isVisible().catch(() => false))) {
    const toggle = page.locator('#main-outlet button.advanced-filters__toggle, #main-outlet .advanced-filters summary').first();
    if (await toggle.isVisible().catch(() => false)) await h.press(toggle);
    group = page.locator(`#main-outlet ${groups[kind]}`).first();
  }
  const kit = group.locator('details.select-kit, .select-kit').first();
  const name = kind === 'author' ? h.usernameOf(this, value) : value;
  const offered = await h.choose(this, kit, name);
  if (offered) throw friendly({ message: `The "${kind}" filter offers no "${value}". It offers ${offered}.`, hint: 'The advanced filters offer the categories, tags and accounts of the forum.' });
  await runFullSearch(this);
});

/**
 * The full-page search found a number of results, as its count reads.
 *
 * Example #1: Then the search should find 1 result
 * Example #2: Then the search should find 2 results
 * Example #3: Then the search should find no results
 * Example #4: Then the search should find one result
 * Example #5: Then the search should find 3 results
 */
Then(/^the search should find (\w+) results?$/, async function (number) {
  const page = this.page;
  const wanted = number === 'no' ? 0 : h.count(number);
  await h.forumReady(this);
  const read = async () => {
    const results = await pageResults(page);
    // The count's words and its search term are separate elements: their texts are joined with spaces.
    const countText = h.clean(await page.locator('#main-outlet .result-count').first().evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const parts = [];
      while (walker.nextNode()) parts.push(walker.currentNode.textContent);
      return parts.join(' ');
    }, null, { timeout: 1000 }).catch(() => ''));
    const none = await page.locator('#main-outlet .no-results-container, #main-outlet .search-results .no-results, #main-outlet .fps-invalid').isVisible().catch(() => false);
    return { results, countText, none };
  };
  await h.eventually(this, read, (r) => (wanted === 0 ? r.results.length === 0 && (r.none || /^0 results|no results/i.test(r.countText) || r.countText === '') : r.results.length === wanted), async (r) => ({
    message: `The search found ${r.results.length} result${r.results.length === 1 ? '' : 's'}${r.countText ? ` ("${r.countText}")` : ''}, not ${wanted}: ${h.listed(r.results)}.`,
    hint: 'The full search page counts the results of the words and filters of its field; the forum indexes a post a moment after it is made.',
  }), 10000);
});

/**
 * The full-page search's results show (or do not show) a topic by its title.
 *
 * Example #1: Then the search results should show "Where are the nightly backups kept"
 * Example #2: Then the search results should show "Favourite keyboard shortcuts of the team"
 * Example #3: Then the search results should not show "How to install the product on a laptop"
 * Example #4: Then the search results should show "A topic for the search to find"
 * Example #5: Then the search results should not show "Ideas for the next community meetup"
 */
Then(/^the search results should (not )?show "([^"]*)"$/, async function (not, title) {
  const page = this.page;
  await h.forumReady(this);
  if (not) {
    const list = await pageResults(page);
    if (list.some((t) => h.same(t, title))) throw friendly({ message: `The search results show "${title}".`, hint: 'A filter narrows the results to its category, tag or author.' });
    return;
  }
  await h.eventually(this, () => pageResults(page), (list) => list.some((t) => h.same(t, title)), async (list) => ({
    message: `The search results do not show "${title}". They show ${h.listed(list)}.`,
    hint: 'The full search page lists the topics whose posts match the words and filters of its field.',
  }), 10000);
});

/**
 * The field of the full search page holds the words and the filters it
 * searches for (a filter chosen in the advanced filters adds its term:
 * "#support", "tags:howto", "@member").
 *
 * Example #1: Then the search field should read "backups #support"
 * Example #2: Then the search field should read "keyboard @member"
 * Example #3: Then the search field should read "laptop tags:howto"
 * Example #4: Then the search field should read "backups"
 * Example #5: Then the search field should read "backups #support @member"
 */
Then(/^the search field should read "([^"]*)"$/, async function (expected) {
  const input = this.page.locator('#main-outlet input.full-page-search').first();
  await h.eventually(this, () => input.inputValue().catch(() => ''), (v) => h.same(v, expected), async (v) => ({
    message: `The search field reads "${v}", not "${expected}".`,
    hint: 'The advanced filters write their terms into the search field.',
  }), 8000);
});

module.exports = {};
