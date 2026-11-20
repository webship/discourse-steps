'use strict';

// The moderator's actions on a topic (close and open, pin and unpin, unlist and
// list) from the topic's admin menu, the state of a topic, and the review queue.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');
const { topicTitle } = require('./discourse-topic.steps');

/** The id of the topic on screen, from its title's heading. */
async function topicId(world) {
  const id = await world.page.locator('#topic-title h1[data-topic-id]').first().getAttribute('data-topic-id', { timeout: 5000 }).catch(() => null);
  if (!id) throw h.fail(world, `The page is not a topic: ${await h.pageSummary(world)}.`, 'Open a topic first ("When I open the topic "..."").');
  return id;
}

/** The state of the topic on screen, as the forum keeps it (its JSON, with the browser's session). */
async function topicState(world) {
  const id = await topicId(world);
  const res = await world.context.request.get(`${h.siteRoot(world)}/t/${id}.json`, { headers: h.XHR_HEADERS, failOnStatusCode: false });
  const json = res.ok() ? await res.json() : {};
  return { closed: !!json.closed, pinned: !!(json.pinned || json.pinned_globally), pinnedGlobally: !!json.pinned_globally, unlisted: json.visible === false, archived: !!json.archived };
}

/** Open the topic's admin menu (the wrench of a moderator) and choose an item by its words. */
async function adminAction(world, item) {
  const page = world.page;
  const trigger = page.locator('#topic-footer-buttons button.topic-admin-menu-trigger, .topic-footer-main-buttons button.topic-admin-menu-trigger, button.topic-admin-menu-trigger').first();
  if (!(await trigger.isVisible().catch(() => false))) {
    throw h.fail(world, `The topic "${await topicTitle(page)}" offers no topic admin menu.`, 'The topic admin menu (the wrench) is a moderator\'s or an admin\'s; "Then I should not see the topic admin menu" checks that an account has none.');
  }
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await h.press(trigger);
  const menu = await h.eventually(world, () => h.openMenu(page, 'topic-admin-menu'), Boolean, async () => ({ message: 'The topic admin menu did not open.', hint: 'Look at the screenshot of the failure.' }), 5000);
  const buttons = menu.locator('button');
  const n = await buttons.count();
  const offered = [];
  for (let i = 0; i < n; i += 1) {
    const text = h.clean(await buttons.nth(i).innerText());
    offered.push(text);
    if (h.same(text, item)) return buttons.nth(i);
  }
  await page.keyboard.press('Escape');
  throw friendly({ message: `The topic admin menu has no "${item}". It has ${h.listed(offered, 20)}.`, hint: 'The menu offers "Open Topic" on a closed topic, "Un-Pin Topic…" on a pinned one and "List Topic" on an unlisted one.' });
}

/** Choose an item of the admin menu that changes the topic's status, and wait for the forum's answer. */
async function changeStatus(world, item, check) {
  const button = await adminAction(world, item);
  await h.withRequest(world, (m, u) => m === 'PUT' && /\/t\/[^/]+\/\d+\/status$|\/t\/\d+\/status$/.test(new URL(u).pathname), () => button.click(), { what: `"${item}" (PUT /t/.../status)` });
  await h.forumReady(world);
  await h.eventually(world, () => topicState(world), check, async (state) => ({ message: `The topic did not change after "${item}" (closed ${state.closed}, pinned ${state.pinned}, unlisted ${state.unlisted}).`, hint: 'The forum answered the change; reload the topic to see its state.' }), 8000);
}

/** After a status change: give the topic its state back when the scenario ends (the data administrator). */
function restoreAfter(world, id, status, enabled) {
  if (!h.cleansUp(world)) return;
  h.afterScenario(world, `status:${id}:${status}`, async () => {
    const client = await h.dataAdmin(world);
    const { json } = await client.call('GET', `/t/${id}.json`);
    if (!json || json.errors) return;
    const now = { closed: !!json.closed, pinned: !!(json.pinned || json.pinned_globally), visible: json.visible !== false }[status];
    if (now !== enabled) await client.call('PUT', `/t/${id}/status.json`, { status, enabled: String(enabled) });
  });
}

/**
 * Close the topic on screen, or open it again, from its admin menu; the topic
 * gets its state back after the scenario.
 *
 * Example #1: When I close the topic
 * Example #2: When I open the topic again
 * Example #3: When we close the topic
 * Example #4: When I close the topic
 *               Then the topic should be closed
 * Example #5: When I open the topic again
 *               Then the topic should be open
 */
When(/^(?:I|we) (close the topic|open the topic again)$/, async function (action) {
  const id = await topicId(this);
  const before = await topicState(this);
  if (action === 'close the topic') {
    await changeStatus(this, 'Close Topic', (s) => s.closed);
    restoreAfter(this, id, 'closed', before.closed);
  } else {
    await changeStatus(this, 'Open Topic', (s) => !s.closed);
    restoreAfter(this, id, 'closed', before.closed);
  }
});

/** Pin the topic on screen until a time of the pin dialog, in its category or globally; the topic gets its state back after the scenario. */
async function pinTopic(world, until, globally) {
  const page = world.page;
  const id = await topicId(world);
  const before = await topicState(world);
  restoreAfter(world, id, 'pinned', before.pinned);
  const item = await adminAction(world, 'Pin Topic…');
  await item.click();
  const dialog = await h.eventually(world, () => h.openDialog(page, 'Feature this topic'), Boolean, async () => ({ message: 'The pin dialog did not open.', hint: '"Pin Topic…" opens the dialog "Feature this topic".' }), 8000);
  const kits = dialog.locator('details.future-date-input-selector');
  const kit = globally ? kits.nth(1) : kits.first();
  const offered = await h.choose(world, kit, until, { filter: false });
  if (offered) {
    await page.keyboard.press('Escape');
    throw friendly({ message: `The pin dialog offers no time "${until}". It offers ${offered}.`, hint: 'Name a time as the dialog lists it ("Tomorrow", "Two weeks", "Next month", "Forever").' });
  }
  const button = dialog.getByRole('button', { name: globally ? 'Pin Topic Globally' : 'Pin Topic', exact: true });
  await h.withRequest(world, (m, u) => m === 'PUT' && /\/status$/.test(new URL(u).pathname), () => button.click(), { what: 'the pin (PUT /t/.../status)' });
  await h.forumReady(world);
  await h.eventually(world, () => topicState(world), (s) => (globally ? s.pinnedGlobally : s.pinned), async () => ({ message: `The topic is not pinned${globally ? ' globally' : ''} after the pin.`, hint: 'Reload the topic to see its state.' }), 8000);
}

/**
 * Pin the topic on screen in its category until a time the pin dialog offers
 * ("Tomorrow", "Two weeks", "Next month", "Forever", ...), from its admin menu;
 * the topic gets its state back after the scenario.
 *
 * Example #1: When I pin the topic until "Next month"
 * Example #2: When I pin the topic until "Two weeks"
 * Example #3: When we pin the topic until "Tomorrow"
 * Example #4: When I pin the topic until "Forever"
 * Example #5: When I pin the topic until "Next month"
 *               Then the topic should be pinned
 */
When(/^(?:I|we) pin the topic until "([^"]*)"$/, async function (until) {
  await pinTopic(this, until, false);
});

/**
 * Pin the topic on screen globally (at the top of every topic list) until a
 * time the pin dialog offers; the topic gets its state back after the scenario.
 *
 * Example #1: When I pin the topic globally until "Two weeks"
 * Example #2: When I pin the topic globally until "Tomorrow"
 * Example #3: When we pin the topic globally until "Next month"
 * Example #4: When I pin the topic globally until "Forever"
 * Example #5: When I pin the topic globally until "Two weeks"
 *               Then the topic should be pinned
 */
When(/^(?:I|we) pin the topic globally until "([^"]*)"$/, async function (until) {
  await pinTopic(this, until, true);
});

/**
 * Unpin the topic on screen ("Un-Pin Topic…" of its admin menu, then the pin
 * dialog's "Un-Pin Topic"); the topic gets its state back after the scenario.
 *
 * Example #1: When I unpin the topic
 * Example #2: When we unpin the topic
 * Example #3: When I unpin the topic
 *               Then the topic should not be pinned
 * Example #4: When I unpin the topic
 *               Then the topic should show the action "Unpinned"
 * Example #5: When I unpin the topic
 *               And I go to the "Latest" topic list
 */
When(/^(?:I|we) unpin the topic$/, async function () {
  const page = this.page;
  const id = await topicId(this);
  const before = await topicState(this);
  restoreAfter(this, id, 'pinned', before.pinned);
  const item = await adminAction(this, 'Un-Pin Topic…');
  await item.click();
  const dialog = await h.eventually(this, () => h.openDialog(page, 'Feature this topic'), Boolean, async () => ({ message: 'The pin dialog did not open.', hint: '"Un-Pin Topic…" opens the dialog "Feature this topic".' }), 8000);
  await h.withRequest(this, (m, u) => m === 'PUT' && /\/status$/.test(new URL(u).pathname), () => dialog.getByRole('button', { name: 'Un-Pin Topic' }).click(), { what: 'the unpin (PUT /t/.../status)' });
  await h.forumReady(this);
  await h.eventually(this, () => topicState(this), (s) => !s.pinned, async () => ({ message: 'The topic is still pinned.', hint: 'Reload the topic to see its state.' }), 8000);
});

/**
 * Try to pin the topic on screen without choosing until when, for the pin
 * dialog's refusal; the next step reads it, and the dialog is closed after it.
 *
 * Example #1: When I try to pin the topic without a time
 * Example #2: When we try to pin the topic without a time
 * Example #3: When I try to pin the topic without a time
 *               Then the pin dialog should show the error "A date is required to pin this topic."
 * Example #4: And I try to pin the topic without a time
 * Example #5: When I try to pin the topic without a time
 *               Then the topic should not be pinned
 */
When(/^(?:I|we) try to pin the topic without a time$/, async function () {
  const page = this.page;
  const item = await adminAction(this, 'Pin Topic…');
  await item.click();
  const dialog = await h.eventually(this, () => h.openDialog(page, 'Feature this topic'), Boolean, async () => ({ message: 'The pin dialog did not open.', hint: '"Pin Topic…" opens the dialog "Feature this topic".' }), 8000);
  await dialog.getByRole('button', { name: 'Pin Topic', exact: true }).click();
});

/**
 * The pin dialog shows a refusal; the dialog is closed after the check.
 *
 * Example #1: Then the pin dialog should show the error "A date is required to pin this topic."
 * Example #2: Then the pin dialog should show the error "A date is required"
 * Example #3: Then the pin dialog should show the error "Pin until: A date is required to pin this topic."
 * Example #4: Then the pin dialog should show the error "required to pin this topic"
 * Example #5: Then the pin dialog should show the error "A date is required to pin this topic."
 *               And the topic should not be pinned
 */
Then(/^the pin dialog should show the error "([^"]*)"$/, async function (expected) {
  const page = this.page;
  const dialog = await h.openDialog(page, 'Feature this topic');
  if (!dialog) throw h.fail(this, 'The pin dialog is not open.', '"When I try to pin the topic without a time" opens it.');
  await h.eventually(this, () => dialog.locator('.form-kit__errors, .form-kit__errors-summary-list').allInnerTexts().catch(() => []), (texts) => texts.some((t) => h.mentions(t, expected)), async (texts) => ({
    message: `The pin dialog does not show "${expected}". It shows ${h.listed(texts)}.`,
    hint: 'The pin dialog asks until when to pin before it pins.',
  }), 8000);
  await page.keyboard.press('Escape');
  await h.eventually(this, async () => !(await h.openDialog(page, 'Feature this topic')), Boolean, async () => ({ message: 'The pin dialog stayed open.', hint: 'Escape closes the dialog.' }), 5000).catch(() => {});
});

/**
 * Unlist the topic on screen (it leaves the topic lists; its address still
 * works), or list it again, from its admin menu; the topic gets its state back
 * after the scenario.
 *
 * Example #1: When I unlist the topic
 * Example #2: When I list the topic again
 * Example #3: When we unlist the topic
 * Example #4: When I unlist the topic
 *               Then the topic should be unlisted
 * Example #5: When I list the topic again
 *               Then the topic should be listed
 */
When(/^(?:I|we) (unlist the topic|list the topic again)$/, async function (action) {
  const id = await topicId(this);
  const before = await topicState(this);
  restoreAfter(this, id, 'visible', !before.unlisted);
  if (action === 'unlist the topic') await changeStatus(this, 'Unlist Topic', (s) => s.unlisted);
  else await changeStatus(this, 'List Topic', (s) => !s.unlisted);
});

/**
 * The state of the topic on screen, as the forum keeps it; the title's status
 * icon is checked too where the forum draws it at once (closed, unlisted).
 *
 * Example #1: Then the topic should be closed
 * Example #2: Then the topic should be open
 * Example #3: Then the topic should be pinned
 * Example #4: Then the topic should not be pinned
 * Example #5: Then the topic should be unlisted
 */
Then(/^the topic should (be closed|be open|be pinned|not be pinned|be unlisted|be listed)$/, async function (state) {
  const checks = {
    'be closed': (s) => s.closed, 'be open': (s) => !s.closed, 'be pinned': (s) => s.pinned, 'not be pinned': (s) => !s.pinned,
    'be unlisted': (s) => s.unlisted, 'be listed': (s) => !s.unlisted,
  };
  await h.eventually(this, () => topicState(this), checks[state], async (s) => ({
    message: `The topic is ${s.closed ? 'closed' : 'open'}, ${s.pinned ? 'pinned' : 'not pinned'} and ${s.unlisted ? 'unlisted' : 'listed'}; it should ${state}.`,
    hint: 'A moderator changes the state from the topic admin menu (the wrench); the state is the forum\'s own (the topic\'s JSON).',
  }), 8000);
  const icon = { 'be closed': '--closed', 'be unlisted': '--invisible' }[state];
  if (icon) {
    await h.eventually(this, () => this.page.locator('#topic-title .topic-status').evaluateAll((els) => els.map((e) => e.className)), (cls) => cls.some((c) => c.includes(icon)), async (cls) => ({
      message: `The forum has the topic ${state.replace('be ', '')}, but its title shows no such icon (it shows ${h.listed(cls)}).`,
      hint: 'The title of a closed topic shows a lock, of an unlisted one an eye.',
    }), 8000);
  }
});

/**
 * The topic on screen shows the note of a moderator's action ("Closed",
 * "Opened", "Pinned", "Unpinned", "Unlisted", "Listed").
 *
 * Example #1: Then the topic should show the action "Closed"
 * Example #2: Then the topic should show the action "Opened"
 * Example #3: Then the topic should show the action "Pinned"
 * Example #4: Then the topic should show the action "Unlisted"
 * Example #5: Then the topic should show the action "Listed"
 */
Then(/^the topic should show the action "([^"]*)"$/, async function (expected) {
  const page = this.page;
  await h.eventually(this, () => page.locator('.post-stream .small-action').allInnerTexts().catch(() => []), (texts) => texts.some((t) => h.normal(t).startsWith(h.normal(expected))), async (texts) => ({
    message: `The topic shows no action "${expected}". It shows ${h.listed(texts.map((t) => h.clean(t).replace(/\s+just now.*|\s+\d+\s*\w+ ago.*/, '')))}.`,
    hint: 'The forum notes each moderator\'s action in the topic ("Closed just now").',
  }), 8000);
});

/**
 * The account the browser is logged in as sees no topic admin menu on the
 * topic on screen (a member, a new user, a visitor).
 *
 * Example #1: Then I should not see the topic admin menu
 * Example #2: Then we should not see the topic admin menu
 * Example #3: And I should not see the topic admin menu
 * Example #4: But I should not see the topic admin menu
 * Example #5: Then I should not see the topic admin menu
 *               And I should see "Reply"
 */
Then(/^(?:I|we) should not see the topic admin menu$/, async function () {
  await h.forumReady(this);
  if (await this.page.locator('button.topic-admin-menu-trigger').first().isVisible().catch(() => false)) {
    throw friendly({ message: 'The topic shows its admin menu (the wrench).', hint: 'Only moderators and admins get the topic admin menu.' });
  }
});

/** The items of the review queue on screen: [{ id, text, classes }]. */
async function reviewItems(page) {
  return page.locator('#main-outlet .review-item[data-reviewable-id]').evaluateAll((items) => items.map((r) => ({ id: r.getAttribute('data-reviewable-id'), text: r.textContent.replace(/\s+/g, ' ').trim(), classes: r.className })));
}

/**
 * Open the review queue (the pending items, the newest first).
 *
 * Example #1: When I go to the review queue
 * Example #2: When we go to the review queue
 * Example #3: And I go to the review queue
 * Example #4: When I go to the review queue
 *               Then the review queue should list the flagged post "A reply the member flags"
 * Example #5: When I go to the review queue
 *               Then I should see "Review"
 */
When(/^(?:I|we) go to the review queue$/, async function () {
  await h.open(this, '/review');
});

/**
 * The review queue on screen lists (or does not list) a flagged post by a text of
 * the post, as pending.
 *
 * Example #1: Then the review queue should list the flagged post "A reply the member flags as off-topic."
 * Example #2: Then the review queue should list the flagged post "flags as off-topic"
 * Example #3: Then the review queue should not list the flagged post "A reply the member flags as off-topic."
 * Example #4: Then the review queue should list the flagged post "A post flagged by the suite"
 * Example #5: Then the review queue should not list the flagged post "A post flagged by the suite"
 */
Then(/^the review queue should (not )?list the flagged post "([^"]*)"$/, async function (not, text) {
  const page = this.page;
  await h.forumReady(this);
  const pending = (list) => list.filter((r) => !/reviewable-stale/.test(r.classes) && h.mentions(r.text, text));
  if (not) {
    const list = pending(await reviewItems(page));
    if (list.length) throw friendly({ message: `The review queue lists the flagged post "${text}" as pending.`, hint: 'A moderator\'s decision takes an item out of the pending queue.' });
    return;
  }
  await h.eventually(this, () => reviewItems(page), (list) => pending(list).length > 0, async (list) => ({
    message: `The review queue does not list the flagged post "${text}". It lists ${h.listed(list.map((r) => r.text.slice(0, 80)), 6)}.`,
    hint: 'A flagged post goes to the review queue of the moderators at once; reload the queue if it was open before the flag.',
  }), 10000);
});

/**
 * Decide on a flagged post of the review queue on screen with one of the
 * queue's answers ("Keep post", "Do nothing", "Hide post", ...), by a text of the
 * post; the step waits for the forum's answer.
 *
 * Example #1: When I answer "Keep post" to the flagged post "A reply the member flags as off-topic."
 * Example #2: When I answer "Do nothing" to the flagged post "A post flagged by the suite"
 * Example #3: When we answer "Keep post" to the flagged post "flags as off-topic"
 * Example #4: When I answer "Hide post" to the flagged post "A post flagged by the suite"
 * Example #5: When I answer "Keep post" to the flagged post "A post flagged by the suite"
 */
When(/^(?:I|we) answer "([^"]*)" to the flagged post "([^"]*)"$/, async function (answer, text) {
  const page = this.page;
  const list = await h.eventually(this, () => reviewItems(page), (l) => l.some((r) => !/reviewable-stale/.test(r.classes) && h.mentions(r.text, text)), async (l) => ({ message: `The review queue has no pending flagged post "${text}". It lists ${h.listed(l.map((r) => r.text.slice(0, 80)), 6)}.`, hint: 'Flag the post first, then open the review queue.' }));
  const item = list.find((r) => !/reviewable-stale/.test(r.classes) && h.mentions(r.text, text));
  const box = page.locator(`#main-outlet .review-item[data-reviewable-id="${item.id}"]`);
  const kits = box.locator('details.reviewable-action-dropdown');
  const n = await kits.count();
  const offered = [];
  for (let i = 0; i < n; i += 1) {
    const kit = kits.nth(i);
    await h.press(kit.locator('summary').first());
    const rowsLoc = page.locator('.select-kit.is-expanded .select-kit-row');
    await rowsLoc.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const count = await rowsLoc.count();
    for (let j = 0; j < count; j += 1) {
      const name = h.clean(await rowsLoc.nth(j).getAttribute('data-name'));
      offered.push(name);
      if (h.same(name, answer)) {
        await h.withRequest(this, (m, u) => m === 'PUT' && /\/review\/\d+\/perform\//.test(u), () => rowsLoc.nth(j).click(), { what: `"${answer}" (PUT /review/.../perform)` });
        await h.forumReady(this);
        return;
      }
    }
    await page.keyboard.press('Escape');
  }
  throw friendly({ message: `The flagged post "${text}" offers no answer "${answer}". It offers ${h.listed(offered, 20)}.`, hint: 'The queue offers its answers under "Yes" and "No" ("Keep post", "Do nothing", "Delete post and ignore flag", ...).' });
});

module.exports = { topicState };
