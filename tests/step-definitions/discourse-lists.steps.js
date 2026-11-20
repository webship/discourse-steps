'use strict';

// The topic lists (Latest, New, Unread, Top, Hot, Categories), a category's
// page, a tag's page and the tags page: what a list shows, in which order,
// and the state of each topic in it.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');

const LISTS = { latest: '/latest', new: '/new', unread: '/unread', top: '/top', hot: '/hot', categories: '/categories' };

/** The rows of the topic list on screen: [{ id, title, category, tags, replies, classes, statuses }]. */
async function rows(page) {
  return page.locator('#main-outlet .topic-list-item, #main-outlet tr.topic-list-item').evaluateAll((trs) => trs.filter((tr) => tr.getClientRects().length).map((tr) => {
    // The words a person reads: a visited topic's link carries a hidden " read" for screen readers.
    const text = (e) => {
      if (!e) return '';
      const copy = e.cloneNode(true);
      copy.querySelectorAll('.sr-only, .visually-hidden').forEach((x) => x.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    };
    const title = tr.querySelector('a.title, .main-link a.raw-topic-link, .link-top-line a');
    return {
      id: tr.getAttribute('data-topic-id'),
      title: text(title),
      category: text(tr.querySelector('.badge-category__name')),
      tags: [...tr.querySelectorAll('.discourse-tag')].map(text),
      replies: text(tr.querySelector('td.posts .number, td.posts, .posts-map .number, .num.posts')),
      classes: tr.className,
      statuses: [...tr.querySelectorAll('.topic-status')].map((s) => s.className),
    };
  }));
}

/** The titles of the list's rows, for an error message. */
async function titles(page) {
  return (await rows(page)).map((r) => r.title);
}

/** The row of a topic in the list on screen, waiting for the list to show it; a friendly failure when it does not. */
async function rowOf(world, title) {
  return h.eventually(world, async () => (await rows(world.page)).find((r) => h.same(r.title, title)), Boolean, async () => ({
    message: `The topic list does not show "${title}". It shows ${h.listed(await titles(world.page))}.`,
    hint: 'A list shows a topic the account may read: check the list (Latest, New, Unread, ...), its category, and that the topic was made before the list was opened.',
  }));
}

/**
 * Open a topic list of the forum by its name, from its navigation when the page
 * offers it, or at its address (Top and Unread are not in the default menu).
 *
 * Example #1: Given I am on the "Latest" topic list
 * Example #2: Given I am on the "New" topic list
 * Example #3: When I go to the "Unread" topic list
 * Example #4: When I go to the "Top" topic list
 * Example #5: When we go to the "Categories" topic list
 */
When(/^(?:I am|we are|I go|we go) (?:on|to) the "([^"]*)" topic list$/, async function (name) {
  const path = LISTS[h.normal(name)];
  if (!path) throw friendly({ message: `There is no topic list "${name}".`, hint: `The topic lists are ${h.listed(Object.keys(LISTS).map((k) => k[0].toUpperCase() + k.slice(1)))}.` });
  const page = this.page;
  const pill = page.locator(`#navigation-bar li.nav-item_${h.normal(name)} a`).first();
  if (await pill.isVisible().catch(() => false)) {
    await h.press(pill);
    await page.waitForURL((u) => u.pathname === path || (path === '/latest' && u.pathname === '/'), { timeout: h.budget(this) }).catch(() => {});
    await h.forumReady(this);
  } else {
    await h.open(this, path);
  }
});

/**
 * The page on screen is a topic list, with its heading ("All latest topics",
 * "Latest topics in Support", "Latest topics tagged howto").
 *
 * Example #1: Then the topic list should be "All latest topics"
 * Example #2: Then the topic list should be "All new topics"
 * Example #3: Then the topic list should be "Latest topics in Support"
 * Example #4: Then the topic list should be "Latest topics tagged howto"
 * Example #5: Then the topic list should be "All top topics"
 */
Then(/^the topic list should be "([^"]*)"$/, async function (expected) {
  await h.forumReady(this);
  await h.eventually(this, () => h.heading(this.page), (text) => h.same(text, expected), async (text) => ({
    message: `The topic list is "${text || '(no heading)'}", not "${expected}".`,
    hint: 'The heading of a list names it: "All latest topics", "Latest topics in <category>", "Latest topics tagged <tag>".',
  }), 10000);
});

/**
 * The topic list on screen shows (or does not show) a topic, by its title.
 *
 * Example #1: Then the topic list should show "How to install the product on a laptop"
 * Example #2: Then the topic list should show "Where are the nightly backups kept"
 * Example #3: Then the topic list should not show "The old server is retired this month"
 * Example #4: Then the topic list should not show "Your account on the test forum"
 * Example #5: Then the topic list should show "A topic the suite reads today"
 */
Then(/^the topic list should (not )?show "([^"]*)"$/, async function (not, title) {
  await h.forumReady(this);
  if (!not) {
    await rowOf(this, title);
    return;
  }
  const shown = (await rows(this.page)).find((r) => h.same(r.title, title));
  if (shown) throw friendly({ message: `The topic list shows "${title}".`, hint: 'An unlisted topic, a message or a topic of a category the account may not read stays out of a list; check the state of the topic.' });
});

/**
 * The topic list on screen shows every topic of the table, by its title (first
 * column), in any order.
 *
 * Example #1: Then the topic list should show the topics:
 *               | How to install the product on a laptop |
 *               | Where are the nightly backups kept     |
 * Example #2: Then the topic list should show the topics:
 *               | Favourite keyboard shortcuts of the team |
 * Example #3: Then the topic list should show the topics:
 *               | Release notes for the spring update |
 *               | How this test forum is organised    |
 * Example #4: Then the topic list should show the topics:
 *               | Ideas for the next community meetup |
 *               | The old server is retired this month |
 * Example #5: Then the topic list should show the topics:
 *               | A topic the suite reads today |
 */
Then(/^the topic list should show the topics:$/, async function (table) {
  await h.forumReady(this);
  for (const [title] of table.raw()) await rowOf(this, title);
});

/**
 * The first topic of the list on screen (the pinned topics of the forum left
 * out with "unpinned").
 *
 * Example #1: Then the first topic of the list should be "How to install the product on a laptop"
 * Example #2: Then the first unpinned topic of the list should be "A topic the suite reads today"
 * Example #3: Then the first topic of the list should be "Welcome to Webship test forum!"
 * Example #4: Then the first unpinned topic of the list should be "Ideas for the next community meetup"
 * Example #5: Then the first topic of the list should be "Where are the nightly backups kept"
 */
Then(/^the first (unpinned )?topic of the list should be "([^"]*)"$/, async function (unpinned, title) {
  await h.forumReady(this);
  const first = async () => (await rows(this.page)).filter((r) => !unpinned || !/\bpinned\b/.test(r.classes))[0];
  await h.eventually(this, first, (row) => row && h.same(row.title, title), async (row) => ({
    message: `The first ${unpinned ? 'unpinned ' : ''}topic of the list is "${row ? row.title : '(none: the list is empty)'}", not "${title}". The list shows ${h.listed(await titles(this.page))}.`,
    hint: 'Latest lists the topics by their last activity, Top by their score; pinned topics come first in Latest ("the first unpinned topic" leaves them out).',
  }), 10000);
});

/**
 * The topic list on screen shows no topic.
 *
 * Example #1: Then the topic list should be empty
 * Example #2: And the topic list should be empty
 * Example #3: Then the topic list should be empty
 *               And I should see "There are no new topics"
 * Example #4: But the topic list should be empty
 * Example #5: Then the topic list should be empty
 *               And I should see "There are no more"
 */
Then(/^the topic list should be empty$/, async function () {
  await h.forumReady(this);
  const list = await titles(this.page);
  if (list.length) throw friendly({ message: `The topic list is not empty: it shows ${h.listed(list)}.`, hint: 'New and Unread are per account: a topic the account read is no longer new.' });
});

/**
 * The category of a topic in the list on screen, as the list shows it beside
 * the title (a subcategory by its own name).
 *
 * Example #1: Then the topic "Where are the nightly backups kept" in the list should be in the category "Support"
 * Example #2: Then the topic "How to install the product on a laptop" in the list should be in the category "Installation"
 * Example #3: Then the topic "Release notes for the spring update" in the list should be in the category "Announcements"
 * Example #4: Then the topic "Favourite keyboard shortcuts of the team" in the list should be in the category "Off-topic"
 * Example #5: Then the topic "A topic the suite reads today" in the list should be in the category "General"
 */
Then(/^the topic "([^"]*)" in the list should be in the category "([^"]*)"$/, async function (title, category) {
  await h.forumReady(this);
  const row = await rowOf(this, title);
  if (!h.same(row.category, category)) throw friendly({ message: `The topic "${title}" is in the category "${row.category || '(none)'}", not "${category}".`, hint: 'The list shows the category of each topic beside its title (a subcategory by its own name).' });
});

/**
 * A tag of a topic in the list on screen.
 *
 * Example #1: Then the topic "How to install the product on a laptop" in the list should have the tag "howto"
 * Example #2: Then the topic "Where are the nightly backups kept" in the list should have the tag "backups"
 * Example #3: Then the topic "Where are the nightly backups kept" in the list should have the tag "question"
 * Example #4: Then the topic "Release notes for the spring update" in the list should have the tag "release-notes"
 * Example #5: Then the topic "A topic with tags for the suite" in the list should have the tag "howto"
 */
Then(/^the topic "([^"]*)" in the list should have the tag "([^"]*)"$/, async function (title, tag) {
  await h.forumReady(this);
  const row = await rowOf(this, title);
  if (!row.tags.some((t) => h.same(t, tag))) throw friendly({ message: `The topic "${title}" has the tags ${h.listed(row.tags)}, not "${tag}".`, hint: 'A list shows the tags of a topic under its title.' });
});

/**
 * The number of replies of a topic in the list on screen (the first post is
 * not a reply).
 *
 * Example #1: Then the topic "Favourite keyboard shortcuts of the team" in the list should have 3 replies
 * Example #2: Then the topic "How to install the product on a laptop" in the list should have 2 replies
 * Example #3: Then the topic "Where are the nightly backups kept" in the list should have 1 reply
 * Example #4: Then the topic "Release notes for the spring update" in the list should have 0 replies
 * Example #5: Then the topic "A topic the suite reads today" in the list should have one reply
 */
Then(/^the topic "([^"]*)" in the list should have (\w+) repl(?:y|ies)$/, async function (title, number) {
  await h.forumReady(this);
  const n = h.count(number);
  await h.eventually(this, () => rowOf(this, title), (row) => parseInt(row.replies, 10) === n, async (row) => ({
    message: `The topic "${title}" shows ${row && row.replies !== '' ? row.replies : '(no number of)'} replies in the list, not ${n}.`,
    hint: 'The list counts the replies, the first post left out; a list opened before a reply was made shows the count of then.',
  }), 10000);
});

/**
 * The state of a topic in the list on screen, as the forum marks its row: new
 * (never opened by the account), unread (new replies), closed, pinned or
 * read.
 *
 * Example #1: Then the topic "A topic the suite reads today" in the list should be new
 * Example #2: Then the topic "A topic the suite reads today" in the list should be unread
 * Example #3: Then the topic "The old server is retired this month" in the list should be closed
 * Example #4: Then the topic "Welcome to Webship test forum!" in the list should be pinned
 * Example #5: Then the topic "Favourite keyboard shortcuts of the team" in the list should be read
 */
Then(/^the topic "([^"]*)" in the list should be (new|unread|closed|pinned|read)$/, async function (title, state) {
  await h.forumReady(this);
  const checks = {
    new: (r) => /\bunseen-topic\b/.test(r.classes),
    unread: (r) => /\bunread-posts\b/.test(r.classes),
    closed: (r) => /\bclosed\b/.test(r.classes) || r.statuses.some((s) => /--closed/.test(s)),
    pinned: (r) => /\bpinned\b/.test(r.classes) || r.statuses.some((s) => /--pinned/.test(s)),
    read: (r) => /\bvisited\b/.test(r.classes) && !/\bunread-posts\b|\bunseen-topic\b/.test(r.classes),
  };
  await h.eventually(this, () => rowOf(this, title), checks[state], async (row) => ({
    message: `The topic "${title}" is not marked ${state} in the list (its row: ${row ? row.classes : 'missing'}).`,
    hint: 'New and unread are per account: new is a topic the account never opened, unread one with replies it has not read yet.',
  }), 10000);
});

/**
 * Open a topic from the list on screen, by its title, as a person does.
 *
 * Example #1: When I open "How to install the product on a laptop" from the list
 * Example #2: When I open "Where are the nightly backups kept" from the list
 * Example #3: When I open "A topic the suite reads today" from the list
 * Example #4: When I open "Your account on the test forum" from the list
 * Example #5: When we open "Favourite keyboard shortcuts of the team" from the list
 */
When(/^(?:I|we) open "([^"]*)" from the list$/, async function (title) {
  await h.forumReady(this);
  const row = await rowOf(this, title);
  const link = this.page.locator(`#main-outlet .topic-list-item[data-topic-id="${row.id}"] a.title`).first();
  await h.press(link);
  await this.page.waitForURL(/\/t\//, { timeout: h.budget(this) });
  await h.forumReady(this);
});

/**
 * The categories page lists a category, or a category with its subcategory.
 *
 * Example #1: Then the categories page should list "Support"
 * Example #2: Then the categories page should list "Announcements"
 * Example #3: Then the categories page should list "Support" with the subcategory "Installation"
 * Example #4: Then the categories page should list "Off-topic"
 * Example #5: Then the categories page should list "General"
 */
Then(/^the categories page should list "([^"]*)"(?: with the subcategory "([^"]*)")?$/, async function (name, sub) {
  await h.forumReady(this);
  const read = () => this.page.locator('#main-outlet [data-category-id]').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => ({
    name: ((e.querySelector('.category-name, .badge-category__name, h3') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    subs: [...e.querySelectorAll('.subcategories .badge-category__name, .subcategory .badge-category__name, .category-subcategories .badge-category__name')].map((s) => s.textContent.trim()),
  })));
  const found = await h.eventually(this, read, (list) => list.some((c) => h.same(c.name, name)), async (list) => ({
    message: `The categories page does not list "${name}". It lists ${h.listed(list.map((c) => c.name))}.`,
    hint: 'The categories page lists the categories the account may read, with their subcategories inside them.',
  }), 10000);
  if (sub) {
    const cat = found.find((c) => h.same(c.name, name));
    if (!cat.subs.some((s) => h.same(s, sub))) throw friendly({ message: `The category "${name}" lists the subcategories ${h.listed(cat.subs)}, not "${sub}".`, hint: 'A subcategory shows inside its parent on the categories page.' });
  }
});

/**
 * Open a category's page, or a tag's page, by its name, at the address the
 * forum gives it.
 *
 * Example #1: When I go to the category "Support"
 * Example #2: When I go to the category "Support > Installation"
 * Example #3: When I go to the tag "howto"
 * Example #4: When I go to the tag "release-notes"
 * Example #5: When we go to the category "Announcements"
 */
When(/^(?:I|we) go to the (category|tag) "([^"]*)"$/, async function (kind, name) {
  if (kind === 'tag') {
    await h.open(this, `/tag/${encodeURIComponent(name)}`);
    return;
  }
  const cat = await h.categoryNamed(this, name);
  const all = await h.categories(this);
  const parent = cat.parent ? all.find((c) => c.id === cat.parent) : null;
  await h.open(this, `/c/${parent ? `${parent.slug}/` : ''}${cat.slug}/${cat.id}`);
});

/**
 * The tags page lists a tag, with the number of topics it is on when given.
 *
 * Example #1: Then the tags page should list "howto"
 * Example #2: Then the tags page should list "release-notes" on 2 topics
 * Example #3: Then the tags page should list "backups" on 1 topic
 * Example #4: Then the tags page should list "question"
 * Example #5: Then the tags page should list "howto" on 1 topic
 */
Then(/^the tags page should list "([^"]*)"(?: on (\d+) topics?)?$/, async function (tag, n) {
  await h.forumReady(this);
  const read = () => this.page.locator('#main-outlet .tag-box').evaluateAll((boxes) => boxes.map((b) => ({ name: ((b.querySelector('.discourse-tag') || {}).textContent || '').trim(), count: ((b.querySelector('.tag-count') || {}).textContent || '').replace(/[^\d]/g, '') })));
  const list = await h.eventually(this, read, (l) => l.some((t) => h.same(t.name, tag)), async (l) => ({
    message: `The tags page does not list "${tag}". It lists ${h.listed(l.map((t) => t.name))}.`,
    hint: 'The tags page is /tags; it lists the tags the account may see with the number of their topics.',
  }), 10000);
  if (n != null) {
    const box = list.find((t) => h.same(t.name, tag));
    if (parseInt(box.count, 10) !== parseInt(n, 10)) throw friendly({ message: `The tag "${tag}" is on ${box.count} topics, not ${n}.`, hint: 'The count is the number of topics with the tag the account may see.' });
  }
});

module.exports = { rows, rowOf };
