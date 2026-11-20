'use strict';

// Personal messages: the messages of an account, a new message with its
// recipients, who takes part in a message, and the refusal a new account meets.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');
const { rows } = require('./discourse-lists.steps');

/**
 * Open the messages of the account the browser is logged in as (its inbox), or
 * one of their lists ("Sent", "New", "Unread", "Archive").
 *
 * Example #1: When I go to my messages
 * Example #2: When I go to my "Sent" messages
 * Example #3: When I go to my "Archive" messages
 * Example #4: When we go to my messages
 * Example #5: When I go to my "New" messages
 */
When(/^(?:I|we) go to my (?:"([^"]*)" )?messages$/, async function (list) {
  const username = await h.currentUsername(this);
  if (!username) throw h.fail(this, 'Nobody is logged in, so there are no messages to open.', 'Log in first.');
  const path = list ? `/u/${username}/messages/${h.normal(list)}` : `/u/${username}/messages`;
  await h.open(this, path);
});

/**
 * The messages list on screen shows (or does not show) a message by its title.
 *
 * Example #1: Then my messages should list "A message the member reads today"
 * Example #2: Then my messages should list "Your account on the test forum"
 * Example #3: Then my messages should not list "A message the member sends today"
 * Example #4: Then my messages should list "A message the member sends today"
 * Example #5: Then my messages should not list "A note from the administrator"
 */
Then(/^my messages should (not )?list "([^"]*)"$/, async function (not, title) {
  await h.forumReady(this);
  const shown = async () => (await rows(this.page)).map((r) => r.title);
  if (not) {
    const list = await shown();
    if (list.some((t) => h.same(t, title))) throw friendly({ message: `The messages list shows "${title}".`, hint: 'A message is in the lists of the accounts it was sent to and of its author.' });
    return;
  }
  await h.eventually(this, shown, (list) => list.some((t) => h.same(t, title)), async (list) => ({
    message: `The messages list does not show "${title}". It shows ${h.listed(list)}.`,
    hint: 'The inbox lists the messages of the account; "Sent" those it wrote.',
  }));
});

/**
 * Open the composer of a new message from the messages page ("New Message").
 *
 * Example #1: When I open the composer for a new message
 * Example #2: When we open the composer for a new message
 * Example #3: And I open the composer for a new message
 * Example #4: When I open the composer for a new message
 *               And I add the recipient "moderator" in the composer
 * Example #5: When I open the composer for a new message
 *               Then the composer should be open
 */
When(/^(?:I|we) open the composer for a new message$/, async function () {
  const page = this.page;
  let button = page.locator('#main-outlet button.new-private-message').first();
  if (!(await button.isVisible().catch(() => false))) {
    const username = await h.currentUsername(this);
    if (username) await h.open(this, `/u/${username}/messages`);
    button = page.locator('#main-outlet button.new-private-message').first();
  }
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, `The messages page offers no "New Message" button: ${await h.pageSummary(this)}.`, 'An account below the trust level that may send messages has none ("Then I should not be able to start a message").');
  await h.press(button);
  await h.waitForComposer(this, 'The composer of a new message');
});

/**
 * Add a recipient to the message in the composer, by a handle of the users
 * registry or a username, with the composer's recipients chooser.
 *
 * Example #1: When I add the recipient "moderator" in the composer
 * Example #2: When I add the recipient "member" in the composer
 * Example #3: When I add the recipient "administrator" in the composer
 * Example #4: When we add the recipient "moderator" in the composer
 * Example #5: When I add the recipient "member" in the composer
 *               And I add the recipient "moderator" in the composer
 */
When(/^(?:I|we) add the recipient "([^"]*)" in the composer$/, async function (who) {
  const kit = this.page.locator('#reply-control #private-message-users').first();
  if (!(await kit.isVisible().catch(() => false))) throw h.fail(this, 'The composer has no recipients chooser.', 'Open the composer of a new message first.');
  const username = h.usernameOf(this, who);
  const offered = await h.choose(this, kit, username);
  if (offered) throw friendly({ message: `The recipients chooser offers no "${username}". It offers ${offered}.`, hint: 'The chooser finds an account by the start of its username.' });
});

/**
 * Send a message from the composer, in one step: a new message to a recipient,
 * with a title and a body; the step waits until the forum opens it. It is
 * deleted after the scenario.
 *
 * Example #1: When I send the message "A message the member sends today" to "moderator" with "A message written by the suite for this scenario."
 * Example #2: When we send the message "A question for the moderator" to "moderator" with "Can you look at the backups topic, please?"
 * Example #3: When I send the message "A note to the administrator" to "administrator" with "A note written by the suite for this scenario."
 * Example #4: When I send the message "A message to the member" to "member" with "Hello member, the suite writes to you."
 * Example #5: When I send the message "A message the member sends today" to "moderator" with "Another message written by the suite."
 */
When(/^(?:I|we) send the message "([^"]*)" to "([^"]*)" with "([^"]*)"$/, async function (title, who, body) {
  const page = this.page;
  const username = await h.currentUsername(this);
  if (!username) throw h.fail(this, 'Nobody is logged in, so no message can be sent.', 'Log in first.');
  await h.open(this, `/u/${username}/messages`);
  const button = page.locator('#main-outlet button.new-private-message').first();
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, 'The messages page offers no "New Message" button.', 'An account below the trust level that may send messages has none.');
  await h.press(button);
  await h.waitForComposer(this, 'The composer of a new message');
  const offered = await h.choose(this, page.locator('#reply-control #private-message-users').first(), h.usernameOf(this, who));
  if (offered) throw friendly({ message: `The recipients chooser offers no "${who}". It offers ${offered}.`, hint: 'Name an account of the users registry, or a username.' });
  await page.locator('#reply-control #reply-title').fill(title);
  await h.writeInComposer(this, body);
  const { errors, json } = await h.submitComposer(this);
  if (errors.length) throw friendly({ message: `The forum refused the message: ${errors.join(' ')}`, hint: 'A message needs a recipient, a title of 15 characters or more and a body of 20 or more.' });
  await page.waitForURL(new RegExp(`/t/[^/]+/${json.post.topic_id}`), { timeout: h.budget(this) }).catch(() => {});
  await h.forumReady(this);
});

/**
 * The message on screen is a personal message between these accounts (its
 * participants, by handle or username, in any order).
 *
 * Example #1: Then the message should be between "member" and "moderator"
 * Example #2: Then the message should be between "administrator" and "member"
 * Example #3: Then the message should be between "member", "moderator" and "administrator"
 * Example #4: Then the message should be between "moderator" and "member"
 * Example #5: Then the message should be between "member" and "administrator"
 */
Then(/^the message should be between ("[^"]*"(?:(?:, | and )"[^"]*")*)$/, async function (people) {
  const page = this.page;
  await h.forumReady(this);
  const wanted = h.quotedList(people).map((who) => h.usernameOf(this, who));
  const read = () => page.locator('.topic-map__private-message-map .user, .private-message-map .user, .participants .user').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
  if (!(await page.locator('body.archetype-private_message').count())) throw h.fail(this, `The page is not a personal message: ${await h.pageSummary(this)}.`, 'A personal message opens like a topic, with its participants above the posts.');
  await h.eventually(this, read, (list) => wanted.every((w) => list.some((x) => h.same(x, w))), async (list) => ({
    message: `The message is between ${h.listed(list)}, not ${h.listed(wanted)}.`,
    hint: 'The participants of a message are listed above its posts.',
  }), 8000);
});

/**
 * The account the browser is logged in as may not start a message: its
 * messages page offers no "New Message" button.
 *
 * Example #1: Then I should not be able to start a message
 * Example #2: Then we should not be able to start a message
 * Example #3: And I should not be able to start a message
 * Example #4: But I should not be able to start a message
 * Example #5: Then I should not be able to start a message
 *               And I should see "You don’t have any messages"
 */
Then(/^(?:I|we) should not be able to start a message$/, async function () {
  const username = await h.currentUsername(this);
  if (!username) throw h.fail(this, 'Nobody is logged in.', 'Log in first: the check is about an account.');
  if (!h.mentions(h.currentPath(this), `/u/${username}/messages`)) await h.open(this, `/u/${username}/messages`);
  await h.forumReady(this);
  if (await this.page.locator('#main-outlet button.new-private-message').isVisible().catch(() => false)) {
    throw friendly({ message: `The account ${username} is offered "New Message".`, hint: 'The forum lets the trust levels of the setting "personal message enabled groups" send messages (trust level 1 and up by default).' });
  }
});

module.exports = {};
