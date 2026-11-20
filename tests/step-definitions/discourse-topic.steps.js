'use strict';

// A topic: opening it, reading its posts, replying to it or to a post,
// quoting, liking, bookmarking and flagging a post.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');
const { topicNamed } = require('./discourse-data.steps');

/** The posts of the topic on screen: [{ number, id, username, text, classes }]. */
async function posts(page) {
  return page.locator('.post-stream .topic-post[data-post-number]').evaluateAll((els) => els.map((p) => {
    const article = p.querySelector('article');
    return {
      number: parseInt(p.getAttribute('data-post-number'), 10),
      id: article ? article.getAttribute('data-post-id') : null,
      username: ((p.querySelector('.names .username, .names a, .names') || {}).textContent || '').replace(/\s+/g, ' ').trim().split(' ')[0],
      text: ((p.querySelector('.cooked') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      classes: p.className,
    };
  }));
}

/** The title of the topic on screen. */
async function topicTitle(page) {
  return h.clean(await page.locator('#topic-title .fancy-title').first().innerText({ timeout: 2000 }).catch(() => ''));
}

/** A post of the topic on screen by its number, scrolled into view (the stream loads the posts near the window); a locator. */
async function post(world, number) {
  const page = world.page;
  const loc = page.locator(`.post-stream .topic-post[data-post-number="${number}"]`).first();
  if (!(await loc.count())) {
    const topicUrl = page.url().replace(/(\/t\/[^/]+\/\d+)(\/\d+)?.*$/, `$1/${number}`);
    if (topicUrl !== page.url()) await h.open(world, topicUrl);
  }
  try {
    await loc.waitFor({ state: 'attached', timeout: 10000 });
  } catch {
    const shown = (await posts(page)).map((p) => `#${p.number}`);
    throw h.fail(world, `The topic "${await topicTitle(page)}" shows no post #${number}. It shows ${h.listed(shown)}.`, 'Posts are counted from 1 (the first post); a reply made in this scenario is the next number.');
  }
  await h.toMiddle(loc);
  return loc;
}

/**
 * Open a topic (or a message) by its title, at the address the forum gives it,
 * found through the forum's own search.
 *
 * Example #1: When I open the topic "How to install the product on a laptop"
 * Example #2: When I open the topic "Where are the nightly backups kept"
 * Example #3: When I open the topic "A topic the suite reads today"
 * Example #4: When I open the topic "A message the member reads today"
 * Example #5: Given I open the topic "Favourite keyboard shortcuts of the team"
 */
When(/^(?:I|we) open the topic "([^"]*)"$/, async function (title) {
  const topic = await topicNamed(this, title);
  await h.open(this, `/t/${topic.slug || 'topic'}/${topic.id}`);
  const shown = await topicTitle(this.page);
  if (!h.same(shown, title)) {
    throw h.fail(this, `The topic "${title}" did not open: ${await h.pageSummary(this)}.`, 'A topic of a category the account may not read, or a message it is not in, opens an error page.');
  }
});

/**
 * The page on screen is a topic with this title.
 *
 * Example #1: Then I should be reading the topic "How to install the product on a laptop"
 * Example #2: Then I should be reading the topic "A topic the suite reads today"
 * Example #3: Then we should be reading the topic "Where are the nightly backups kept"
 * Example #4: Then I should be reading the topic "A message the member reads today"
 * Example #5: Then I should be reading the topic "A topic the member writes today"
 */
Then(/^(?:I|we) should be reading the topic "([^"]*)"$/, async function (title) {
  await h.forumReady(this);
  await h.eventually(this, () => topicTitle(this.page), (t) => h.same(t, title), async (t) => ({
    message: `The page is not the topic "${title}": ${t ? `it is the topic "${t}"` : await h.pageSummary(this)}.`,
    hint: 'A topic opens at /t/<slug>/<id>; its title is the heading of the page.',
  }), 10000);
});

/**
 * Read the topic on screen to its last post, the way the forum counts reading:
 * the posts are brought into the window and the step waits until the forum has
 * taken the reading time of the account (its own POST /topics/timings). From
 * then the topic is no longer new for the account, and a later reply makes it
 * unread.
 *
 * Example #1: When I read the topic
 * Example #2: When we read the topic
 * Example #3: When I read the topic
 *               Then the topic "A topic the suite reads today" in the list should be read
 * Example #4: When I read the topic
 *               And I go to the "Unread" topic list
 * Example #5: When I read the topic
 *               Then the topic should have 2 posts
 */
When(/^(?:I|we) read the topic$/, async function () {
  const page = this.page;
  await h.forumReady(this);
  if (!(await page.locator('#topic-title').count())) throw h.fail(this, `The page is not a topic: ${await h.pageSummary(this)}.`, 'Open a topic first.');
  if (!(await h.currentUsername(this))) throw h.fail(this, 'A visitor\'s reading is not kept by the forum.', 'Log in first.');
  const timings = page.waitForResponse((r) => r.request().method() === 'POST' && /\/topics\/timings/.test(r.url()), { timeout: h.budget(this) }).catch(() => null);
  const list = await posts(page);
  for (const p of list) {
    await page.locator(`.post-stream .topic-post[data-post-number="${p.number}"]`).first().evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
    await page.waitForTimeout(150);
  }
  const answer = await timings;
  if (!answer) throw h.fail(this, 'The forum did not take the reading time of the account (no POST /topics/timings answered).', 'The forum counts a post read after it was on screen for a moment; a topic the account already read sends nothing new.');
  await h.forumReady(this);
});

/** The notification level the topic's footer button shows ("Watching", "Tracking", "Normal", "Muted"). */
async function trackingLevel(page) {
  return h.clean(await page.locator('#topic-footer-buttons button.notifications-tracking-trigger').first().innerText({ timeout: 3000 }).catch(() => ''));
}

/**
 * Set how the forum tells the account about the topic on screen, with the
 * topic's notifications button: "Watching" (every reply), "Tracking" (a count
 * of new replies: a reply makes the topic unread), "Normal", "Muted".
 *
 * Example #1: When I set the notifications of the topic to "Tracking"
 * Example #2: When I set the notifications of the topic to "Watching"
 * Example #3: When I set the notifications of the topic to "Normal"
 * Example #4: When we set the notifications of the topic to "Muted"
 * Example #5: When I set the notifications of the topic to "Tracking"
 *               Then the notifications of the topic should be "Tracking"
 */
When(/^(?:I|we) set the notifications of the topic to "([^"]*)"$/, async function (level) {
  const page = this.page;
  const trigger = page.locator('#topic-footer-buttons button.notifications-tracking-trigger').first();
  if (!(await trigger.isVisible().catch(() => false))) throw h.fail(this, 'The topic has no notifications button.', 'A visitor has none; log in first.');
  if (h.same(await trackingLevel(page), level)) return;
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await h.press(trigger);
  const menu = await h.eventually(this, () => h.openMenu(page, 'notifications-tracking'), Boolean, async () => ({ message: 'The notifications menu of the topic did not open.', hint: 'Look at the screenshot of the failure.' }), 5000);
  const buttons = menu.locator('button.notifications-tracking-btn');
  const n = await buttons.count();
  const offered = [];
  for (let i = 0; i < n; i += 1) {
    const text = h.clean(await buttons.nth(i).innerText());
    offered.push(text.split(' ')[0]);
    if (h.normal(text).startsWith(h.normal(level))) {
      await h.withRequest(this, (m, u) => m === 'POST' && /\/t\/\d+\/notifications/.test(u), () => buttons.nth(i).click(), { what: 'the notification level (POST /t/<id>/notifications)' });
      await h.eventually(this, () => trackingLevel(page), (v) => h.same(v, level), async (v) => ({ message: `The notifications of the topic read "${v}", not "${level}".`, hint: 'Look at the screenshot of the failure.' }), 8000);
      await h.forumReady(this);
      return;
    }
  }
  await page.keyboard.press('Escape');
  throw friendly({ message: `The notifications menu of the topic has no "${level}". It has ${h.listed(offered)}.`, hint: 'The levels are Watching, Tracking, Normal and Muted.' });
});

/**
 * The notification level of the topic on screen, as its button reads.
 *
 * Example #1: Then the notifications of the topic should be "Tracking"
 * Example #2: Then the notifications of the topic should be "Watching"
 * Example #3: Then the notifications of the topic should be "Normal"
 * Example #4: Then the notifications of the topic should be "Muted"
 * Example #5: Then the notifications of the topic should be "Watching"
 *               And post 1 should be by "member"
 */
Then(/^the notifications of the topic should be "([^"]*)"$/, async function (level) {
  await h.eventually(this, () => trackingLevel(this.page), (v) => h.same(v, level), async (v) => ({
    message: `The notifications of the topic read "${v || '(no button)'}", not "${level}".`,
    hint: 'The author of a topic watches it; an account that replied tracks it; others are on Normal until they choose.',
  }), 8000);
});

/**
 * The number of posts of the topic on screen (the first post and the replies,
 * the small notes of a moderator's action left out).
 *
 * Example #1: Then the topic should have 3 posts
 * Example #2: Then the topic should have 1 post
 * Example #3: Then the topic should have two posts
 * Example #4: Then the topic should have 4 posts
 * Example #5: Then the topic should have 2 posts
 */
Then(/^the topic should have (\w+) posts?$/, async function (number) {
  const n = h.count(number);
  await h.forumReady(this);
  await h.eventually(this, async () => (await posts(this.page)).filter((p) => !/\bsmall-action\b/.test(p.classes) && p.text !== ''), (list) => list.length === n, async (list) => ({
    message: `The topic "${await topicTitle(this.page)}" shows ${list.length} posts, not ${n}.`,
    hint: 'The topic shows the posts near the window first; for a long topic, count from the top of the topic.',
  }), 10000);
});

/**
 * Who wrote a post of the topic on screen, by its number.
 *
 * Example #1: Then post 1 should be by "member"
 * Example #2: Then post 2 should be by "moderator"
 * Example #3: Then post 3 should be by "administrator"
 * Example #4: Then the last post should be by "member"
 * Example #5: Then post 2 should be by "member"
 */
Then(/^(?:post (\d+)|the last post) should be by "([^"]*)"$/, async function (number, who) {
  await h.forumReady(this);
  const n = number ? parseInt(number, 10) : Math.max(...(await posts(this.page)).map((p) => p.number));
  await post(this, n);
  const username = h.usernameOf(this, who);
  await h.eventually(this, async () => (await posts(this.page)).find((p) => p.number === n), (p) => p && h.same(p.username, username), async (p) => ({
    message: `Post #${n} is by ${p ? p.username : '(nobody)'}, not ${username}.`,
    hint: 'The name of the author is at the top of each post.',
  }), 8000);
});

/**
 * The text of a post of the topic on screen contains a text.
 *
 * Example #1: Then post 1 should read "Which keyboard shortcuts do you use every day?"
 * Example #2: Then post 2 should read "The question mark opens the list"
 * Example #3: Then the last post should read "A reply written by the suite."
 * Example #4: Then post 3 should read "opens the reply composer"
 * Example #5: Then the last post should read "bold words"
 */
Then(/^(?:post (\d+)|the last post) should read "([^"]*)"$/, async function (number, expected) {
  await h.forumReady(this);
  const n = number ? parseInt(number, 10) : Math.max(...(await posts(this.page)).map((p) => p.number));
  await post(this, n);
  await h.eventually(this, async () => (await posts(this.page)).find((p) => p.number === n), (p) => p && h.mentions(p.text, expected), async (p) => ({
    message: `Post #${n} does not read "${expected}". It reads "${p ? p.text.slice(0, 200) : '(no post)'}".`,
    hint: 'The step reads the text of the post as the forum shows it (Markdown turned into text).',
  }), 8000);
});

/**
 * Reply to the topic on screen, or to one of its posts, with a text: the
 * composer opens, the text is written in it, the reply is sent, and the step
 * waits until the forum shows it in the topic. It is deleted after the scenario.
 *
 * Example #1: When I reply to the topic with "A reply written by the suite for this scenario."
 * Example #2: When I reply to post 2 with "A reply to the moderator, written by the suite."
 * Example #3: When we reply to the topic with "Thanks, this answers my question about the backups."
 * Example #4: When I reply to post 1 with "A reply to the first post of the topic, by the suite."
 * Example #5: When I reply to the topic with "Hello @moderator, the suite mentions you in this reply."
 */
When(/^(?:I|we) reply to (?:the topic|post (\d+)) with "([^"]*)"$/, async function (number, text) {
  const page = this.page;
  await h.forumReady(this);
  const before = (await posts(page)).length;
  if (number) {
    const p = await post(this, parseInt(number, 10));
    await h.press(p.locator('button.post-action-menu__reply, button.reply.create').first());
  } else {
    await h.press(page.locator('#topic-footer-buttons button.create').first());
  }
  await h.waitForComposer(this, 'The reply composer');
  await h.writeInComposer(this, text);
  const { errors, json } = await h.submitComposer(this);
  if (errors.length) {
    throw friendly({ message: `The forum refused the reply: ${errors.join(' ')}`, hint: 'A reply needs 20 characters or more, and a closed topic takes none; "Then the composer should show the error ..." checks a refusal.' });
  }
  const id = json && json.post && json.post.id;
  await h.eventually(this, () => posts(page), (list) => list.length > before && list.some((p) => String(p.id) === String(id)), async () => ({
    message: 'The forum took the reply, but the topic does not show it.',
    hint: 'The topic shows a new post at the bottom of the stream; look at the screenshot of the failure.',
  }), 10000);
});

/**
 * Quote a post of the topic on screen in a new reply, the way the forum does it:
 * the post's text is selected and its "Quote" button pressed; the composer opens
 * with the quotation in it.
 *
 * Example #1: When I quote post 2 in a reply
 * Example #2: When I quote post 1 in a reply
 * Example #3: When we quote post 3 in a reply
 * Example #4: When I quote post 2 in a reply
 *               And I add "I agree with this." to the composer
 * Example #5: When I quote post 1 in a reply
 *               And I submit the composer
 */
When(/^(?:I|we) quote post (\d+) in a reply$/, async function (number) {
  const page = this.page;
  const p = await post(this, parseInt(number, 10));
  // A triple click selects the first paragraph of the post, as a person selects a sentence to quote.
  const paragraph = p.locator('.cooked p, .cooked').first();
  await h.toMiddle(paragraph);
  await paragraph.click({ clickCount: 3 });
  const quote = page.locator('.quote-button button.insert-quote').first();
  await quote.waitFor({ state: 'visible', timeout: 8000 }).catch(async () => {
    throw h.fail(this, `Selecting the text of post #${number} shows no "Quote" button.`, 'The forum shows its quote button over a text selected in a post, to an account that may reply.');
  });
  await quote.click();
  await h.waitForComposer(this, 'The composer with the quotation');
  await h.eventually(this, () => h.composerText(page), (t) => t.length > 0, async () => ({ message: 'The composer opened without the quotation.', hint: 'The quote button puts the selected text in the composer as a quotation.' }), 8000);
});

/**
 * A post of the topic on screen quotes a post of an account (the forum's
 * quotation box, with the name of the quoted account).
 *
 * Example #1: Then the last post should quote "moderator"
 * Example #2: Then post 3 should quote "member"
 * Example #3: Then the last post should quote "administrator"
 * Example #4: Then post 2 should quote "member"
 * Example #5: Then the last post should quote "member"
 */
Then(/^(?:post (\d+)|the last post) should quote "([^"]*)"$/, async function (number, who) {
  await h.forumReady(this);
  const n = number ? parseInt(number, 10) : Math.max(...(await posts(this.page)).map((x) => x.number));
  const p = await post(this, n);
  const username = h.usernameOf(this, who);
  await h.eventually(this, () => p.locator('.cooked aside.quote').evaluateAll((qs) => qs.map((q) => q.getAttribute('data-username') || '')), (names) => names.some((x) => h.same(x, username)), async (names) => ({
    message: `Post #${n} quotes ${names.length ? h.listed(names) : 'nobody'}, not ${username}.`,
    hint: 'A quotation shows in a box with the name of the quoted account; the reply must keep the quotation the quote button put in the composer.',
  }), 8000);
});

/**
 * Like a post of the topic on screen, or take the like back; the step waits
 * for the forum's answer. A like is taken back after the scenario.
 *
 * Example #1: When I like post 2
 * Example #2: When I remove my like from post 2
 * Example #3: When we like post 3
 * Example #4: When I like post 1
 * Example #5: When I remove my like from post 3
 */
When(/^(?:I|we) (like|remove my like from) post (\d+)$/, async function (action, number) {
  const page = this.page;
  const p = await post(this, parseInt(number, 10));
  const liked = await isLiked(p);
  if ((action === 'like') === liked) {
    throw friendly({ message: `Post #${number} is ${liked ? 'already liked' : 'not liked'} by the account.`, hint: action === 'like' ? 'A post is liked once by an account.' : 'Like the post first.' });
  }
  const control = p.locator('.discourse-reactions-reaction-button, button.toggle-like, button.like').first();
  if (!(await control.isVisible().catch(() => false))) {
    throw h.fail(this, `Post #${number} has no like button.`, 'An account cannot like its own post, and a visitor cannot like at all.');
  }
  await h.withRequest(this, (m, u) => (m === 'PUT' && /\/custom-reactions\/[^/]+\/toggle/.test(u)) || (/\/post_actions/.test(u) && ['POST', 'DELETE'].includes(m)), () => h.press(control), { what: 'the like' });
  await h.eventually(this, () => isLiked(p), (now) => now === (action === 'like'), async () => ({ message: `Post #${number} did not turn ${action === 'like' ? 'liked' : 'unliked'}.`, hint: 'The forum marks a post the account liked; look at the screenshot of the failure.' }), 8000);
  await h.forumReady(this);
});

/** Whether the account liked a post (the reactions control, or the classic like button). */
async function isLiked(p) {
  return p.evaluate((el) => !!(el.querySelector('.discourse-reactions-actions.has-reacted, .discourse-reactions-actions.has-used-main-reaction, button.toggle-like.has-like, button.like.has-like')));
}

/** The number of likes a post shows (its reactions counter, or the classic count). */
async function likes(p) {
  return p.evaluate((el) => {
    const counter = el.querySelector('.discourse-reactions-counter .reactions-counter, button.like-count, .like-count');
    const n = counter ? parseInt(counter.textContent.replace(/[^\d]/g, ''), 10) : 0;
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * The number of likes a post of the topic on screen shows, and whether the
 * account liked it.
 *
 * Example #1: Then post 2 should have 1 like
 * Example #2: Then post 1 should have 4 likes
 * Example #3: Then post 2 should have no likes
 * Example #4: Then post 2 should be liked by me
 * Example #5: Then post 3 should not be liked by me
 */
Then(/^post (\d+) should (?:have (\w+) likes?|(be|not be) liked by me)$/, async function (number, n, which) {
  const p = await post(this, parseInt(number, 10));
  if (which) {
    const want = which === 'be';
    await h.eventually(this, () => isLiked(p), (v) => v === want, async () => ({ message: `Post #${number} is ${want ? 'not ' : ''}liked by the account.`, hint: 'The like button of a post the account liked is marked (has-reacted).' }), 8000);
    return;
  }
  const wanted = n === 'no' ? 0 : h.count(n);
  await h.eventually(this, () => likes(p), (v) => v === wanted, async (v) => ({ message: `Post #${number} shows ${v} likes, not ${wanted}.`, hint: 'The counter beside the like button counts every account that liked the post.' }), 8000);
});

/** The bookmark button of a post (in its "show more" actions when they are folded). */
async function bookmarkButton(world, p) {
  let button = p.locator('button.post-action-menu__bookmark, button.bookmark-menu-trigger').first();
  if (!(await button.isVisible().catch(() => false))) {
    const more = p.locator('button.show-more-actions').first();
    if (await more.isVisible().catch(() => false)) await h.press(more);
    button = p.locator('button.post-action-menu__bookmark, button.bookmark-menu-trigger').first();
    await button.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  }
  if (!(await button.isVisible().catch(() => false))) throw h.fail(world, 'The post has no bookmark button.', 'A visitor cannot bookmark; log in first.');
  return button;
}

/**
 * Bookmark a post of the topic on screen (the forum makes the bookmark at once
 * and offers a reminder, which the step leaves alone), or delete its bookmark.
 * A bookmark is deleted after the scenario.
 *
 * Example #1: When I bookmark post 1
 * Example #2: When I delete the bookmark of post 1
 * Example #3: When we bookmark post 2
 * Example #4: When I bookmark post 3
 * Example #5: When I delete the bookmark of post 2
 */
When(/^(?:I|we) (bookmark|delete the bookmark of) post (\d+)$/, async function (action, number) {
  const page = this.page;
  const p = await post(this, parseInt(number, 10));
  const button = await bookmarkButton(this, p);
  const marked = await button.evaluate((b) => b.classList.contains('bookmarked'));
  if ((action === 'bookmark') === marked) throw friendly({ message: `Post #${number} is ${marked ? 'already' : 'not'} bookmarked.`, hint: action === 'bookmark' ? 'Delete the bookmark first.' : 'Bookmark the post first.' });
  if (action === 'bookmark') {
    await h.withRequest(this, (m, u) => m === 'POST' && /\/bookmarks(\.json)?$/.test(new URL(u).pathname), () => h.press(button), { what: 'the bookmark (POST /bookmarks)' });
    const menu = await h.eventually(this, () => h.openMenu(page, 'bookmark-menu'), Boolean, async () => ({ message: 'The bookmark menu did not open after the bookmark was made.', hint: 'The forum offers a reminder in a menu after a bookmark.' }), 5000).catch(() => null);
    if (menu) await page.keyboard.press('Escape');
  } else {
    await h.press(button);
    const menu = await h.eventually(this, () => h.openMenu(page, 'bookmark-menu'), Boolean, async () => ({ message: 'The bookmark menu did not open.', hint: 'The bookmark button of a bookmarked post opens a menu with "Edit" and "Delete".' }), 5000);
    await h.withRequest(this, (m, u) => m === 'DELETE' && /\/bookmarks\//.test(u), () => h.press(menu.locator('button.--danger, button', { hasText: 'Delete' }).first()), { what: 'the deletion of the bookmark' });
  }
  await h.eventually(this, () => button.evaluate((b) => b.classList.contains('bookmarked')), (v) => v === (action === 'bookmark'), async () => ({ message: `The bookmark button of post #${number} did not turn ${action === 'bookmark' ? 'bookmarked' : 'unbookmarked'}.`, hint: 'Look at the screenshot of the failure.' }), 8000);
  await h.forumReady(this);
});

/**
 * Whether a post of the topic on screen is bookmarked by the account.
 *
 * Example #1: Then post 1 should be bookmarked
 * Example #2: Then post 1 should not be bookmarked
 * Example #3: Then post 2 should be bookmarked
 * Example #4: Then post 3 should not be bookmarked
 * Example #5: Then post 2 should not be bookmarked
 */
Then(/^post (\d+) should (not )?be bookmarked$/, async function (number, not) {
  const p = await post(this, parseInt(number, 10));
  const button = await bookmarkButton(this, p);
  await h.eventually(this, () => button.evaluate((b) => b.classList.contains('bookmarked')), (v) => v === !not, async () => ({
    message: `Post #${number} is ${not ? '' : 'not '}bookmarked.`,
    hint: 'The bookmark button of a bookmarked post reads "You\'ve bookmarked this."',
  }), 8000);
});

/**
 * Flag a post of the topic on screen for the moderators, with one of the
 * forum's reasons ("It's Off-Topic", "It's Inappropriate", "It's Spam",
 * "Something Else" needs a message and is not covered).
 *
 * Example #1: When I flag post 2 as "It's Off-Topic"
 * Example #2: When I flag post 1 as "It's Inappropriate"
 * Example #3: When I flag post 2 as "It's Spam"
 * Example #4: When we flag post 3 as "It's Off-Topic"
 * Example #5: When I flag post 1 as "It's Off-Topic"
 */
When(/^(?:I|we) flag post (\d+) as "([^"]*)"$/, async function (number, reason) {
  const page = this.page;
  const p = await post(this, parseInt(number, 10));
  let button = p.locator('button.post-action-menu__flag, button.create-flag').first();
  if (!(await button.isVisible().catch(() => false))) {
    const more = p.locator('button.show-more-actions').first();
    if (await more.isVisible().catch(() => false)) await h.press(more);
  }
  button = p.locator('button.post-action-menu__flag, button.create-flag').first();
  await button.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, `Post #${number} has no flag button.`, 'An account cannot flag its own post, nor flag a post twice; a visitor cannot flag.');
  await h.press(button);
  const dialog = await h.eventually(this, () => h.openDialog(page, 'Thanks for keeping our community civil'), Boolean, async () => ({ message: 'The flag dialog did not open.', hint: 'The flag button opens "Thanks for keeping our community civil!".' }), 8000);
  const radios = dialog.getByRole('radio');
  const n = await radios.count();
  let chosen = false;
  const offered = [];
  for (let i = 0; i < n; i += 1) {
    const name = h.clean(await radios.nth(i).evaluate((r) => { const l = r.closest('label') || r.parentElement; return (l && (l.querySelector('strong') || l).textContent) || ''; }));
    offered.push(name);
    if (h.normal(name).startsWith(h.normal(reason))) {
      await radios.nth(i).check();
      chosen = true;
      break;
    }
  }
  if (!chosen) {
    await page.keyboard.press('Escape');
    throw friendly({ message: `The flag dialog offers no reason "${reason}". It offers ${h.listed(offered)}.`, hint: 'Name a reason as the dialog shows it in bold.' });
  }
  await h.withRequest(this, (m, u) => m === 'POST' && /\/post_actions(\.json)?$/.test(new URL(u).pathname), () => dialog.getByRole('button', { name: 'Flag Post' }).click(), { what: 'the flag (POST /post_actions)' });
  await h.eventually(this, async () => !(await h.openDialog(page, 'Thanks for keeping our community civil')), Boolean, async () => ({ message: 'The flag dialog stayed open after the flag was sent.', hint: 'Look at the screenshot of the failure for the forum\'s message.' }), 8000);
  await h.forumReady(this);
});

/**
 * A post of the topic on screen says the account flagged it ("You flagged this
 * as off-topic").
 *
 * Example #1: Then post 2 should show "You flagged this as off-topic"
 * Example #2: Then post 1 should show "You flagged this as inappropriate"
 * Example #3: Then post 2 should show "You flagged this as spam"
 * Example #4: Then post 3 should show "You flagged this"
 * Example #5: Then post 2 should show "flagged this as off-topic"
 */
Then(/^post (\d+) should show "([^"]*)"$/, async function (number, expected) {
  const p = await post(this, parseInt(number, 10));
  await h.eventually(this, () => p.locator('.post-action, .post-notice, .post-info').allInnerTexts().catch(() => []), (texts) => texts.some((t) => h.mentions(t, expected)), async (texts) => ({
    message: `Post #${number} does not show "${expected}". Its notes read ${h.listed(texts)}.`,
    hint: 'The forum notes the account\'s own flag under the post ("You flagged this as ...").',
  }), 8000);
});

module.exports = { posts, post, topicTitle };
