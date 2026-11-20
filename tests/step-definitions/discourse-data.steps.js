'use strict';

// Test topics, replies and messages made through the forum's own API, as the
// account of the users registry a step names, and deleted after the scenario
// with everything the scenario made on screen. This file also sets up every
// page the World opens (the forum's long poll and long timers left out of the
// settle, the requests the browser cut, the responses of what a scenario
// makes) and runs the clean-up after each scenario.

const { Given, Then, After } = require('@cucumber/cucumber');
const { friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');

onNewPage(async (world, page) => {
  world.__forumFailedRequests = [];
  await h.instrument(world, page);
});

After({ name: 'delete what the scenario made on the forum' }, async function () {
  // The page leaves the forum first: a page left open on a topic the clean-up deletes would ask for it
  // again (its reading time, its message bus) and log the forum's 404 as an error of the scenario.
  if (this.page && (this.__forumCleanups || []).length) await this.page.goto('about:blank').catch(() => {});
  const problems = await h.runCleanups(this);
  if (problems.length) {
    // A clean-up that failed does not fail the scenario: the next run's "there is no topic" steps tidy up.
    console.warn(`[discourse-steps] clean-up: ${problems.join('; ')}`);
  }
});

const DEFAULT_BODY = 'This topic was made by the test suite for one scenario, and it is deleted after it.';

/** Make a topic (or a personal message) through the forum's API as an account of the registry; it is deleted after the scenario. */
async function makeTopic(world, { title, category, by, body, tags, to }) {
  // What an earlier run left with this title goes first: the forum refuses a title twice.
  const admin = await h.dataAdmin(world);
  for (const leftover of await h.topicsTitled(world, title)) await admin.call('DELETE', `/t/${leftover.id}.json`);
  const author = await h.apiAs(world, by);
  const data = { title, raw: body || DEFAULT_BODY };
  if (to) {
    data.archetype = 'private_message';
    data.target_recipients = to.map((who) => h.usernameOf(world, who)).join(',');
  } else if (category) {
    data.category = String((await h.categoryNamed(world, category)).id);
  }
  (tags || []).forEach((tag, i) => { data[`tags[${i}]`] = tag; });
  const { status, json } = await author.call('POST', '/posts.json', data);
  const post = json && json.post ? json.post : json;
  if (status >= 400 || !post || !post.topic_id) {
    throw friendly({
      message: `The forum refused the ${to ? 'message' : 'topic'} "${title}" of "${by}" (status ${status}): ${h.errorsOf(json).join(' ') || 'no reason given'}.`,
      hint: 'A title needs 15 characters or more and a body 20 or more; the account must be allowed to post in the category (and to send messages, for a message).',
    });
  }
  h.deleteTopicAfter(world, post.topic_id);
  world.__forumTopics = world.__forumTopics || {};
  world.__forumTopics[h.normal(title)] = { id: post.topic_id, slug: post.topic_slug, title };
  return { id: post.topic_id, slug: post.topic_slug, title, postId: post.id };
}

/** The topic of this scenario, or of the forum, with this title: { id, slug, title }, or a friendly failure. */
async function topicNamed(world, title) {
  const made = world.__forumTopics && world.__forumTopics[h.normal(title)];
  if (made) return made;
  const found = await h.topicsTitled(world, title);
  if (!found.length) {
    throw friendly({ message: `The forum has no topic "${title}".`, hint: 'Make it first ("Given there is a topic "..." in "General" by "moderator""), or name a topic of the sample content.' });
  }
  return found[0];
}

/**
 * Make a topic through the forum's API as an account of the users registry, in
 * a category, with a body of the suite's own; it is deleted after the scenario.
 *
 * Example #1: Given there is a topic "A topic the suite reads today" in "General" by "moderator"
 * Example #2: Given there is a topic "Question about the nightly backups" in "Support" by "member"
 * Example #3: Given there is a topic "A topic for the moderator to close" in "General" by "member"
 * Example #4: Given there is a topic "Installing on a second laptop" in "Support > Installation" by "member"
 * Example #5: Given there is a topic "An announcement for the next release" in "Announcements" by "administrator"
 */
Given(/^there is a topic "([^"]*)" in "([^"]*)" by "([^"]*)"$/, async function (title, category, by) {
  await makeTopic(this, { title, category, by });
});

/**
 * Make a topic as above, with a body and tags from a table (`body`, `tags`
 * with commas).
 *
 * Example #1: Given there is a topic "A topic with tags for the suite" in "Support" by "member" with:
 *               | body | The body of the topic the suite reads. |
 *               | tags | howto, question                        |
 * Example #2: Given there is a topic "A topic with a mention in it" in "General" by "moderator" with:
 *               | body | Hello @member, this topic mentions you for the suite. |
 * Example #3: Given there is a topic "A topic for the search to find" in "General" by "member" with:
 *               | body | The word zeppelin is in this body for the search steps. |
 * Example #4: Given there is a topic "A topic tagged for the tag page" in "Support" by "moderator" with:
 *               | tags | howto |
 * Example #5: Given there is a topic "A topic with a long body to read" in "Off-topic" by "member" with:
 *               | body | One sentence after another, for a topic the suite reads to the end. |
 */
Given(/^there is a topic "([^"]*)" in "([^"]*)" by "([^"]*)" with:$/, async function (title, category, by, table) {
  const rows = Object.fromEntries(table.raw().map(([k, v]) => [h.normal(k), v]));
  const tags = (rows.tags || '').split(/\s*,\s*/).filter(Boolean);
  await makeTopic(this, { title, category, by, body: rows.body, tags });
});

/**
 * Make a personal message through the forum's API from an account of the users
 * registry to one or more others; it is deleted after the scenario.
 *
 * Example #1: Given there is a message "A message the member reads today" from "moderator" to "member"
 * Example #2: Given there is a message "About the meetup next week" from "member" to "moderator"
 * Example #3: Given there is a message "A message to two of the staff" from "member" to "moderator" and "administrator"
 * Example #4: Given there is a message "A question for the moderator" from "member" to "moderator"
 * Example #5: Given there is a message "A note from the administrator" from "administrator" to "member"
 */
Given(/^there is a message "([^"]*)" from "([^"]*)" to ("[^"]*"(?:(?:, | and )"[^"]*")*)$/, async function (title, by, recipients) {
  await makeTopic(this, { title, by, to: h.quotedList(recipients), body: 'This personal message was made by the test suite for one scenario, and it is deleted after it.' });
});

/**
 * Add a reply to a topic through the forum's API as an account of the users
 * registry; it goes with the topic, or alone, after the scenario.
 *
 * Example #1: Given "moderator" replied to the topic "A topic the suite reads today" with "A reply of the moderator for the suite."
 * Example #2: Given "member" replied to the topic "Question about the nightly backups" with "Thanks, that answers my question."
 * Example #3: Given "administrator" replied to the topic "A topic for the moderator to close" with "The administrator adds a reply here."
 * Example #4: Given "moderator" replied to the topic "A topic with a mention in it" with "Hello @member, here is a second mention."
 * Example #5: Given "member" replied to the topic "A message the member reads today" with "A reply in the personal message."
 */
Given(/^"([^"]*)" replied to the topic "([^"]*)" with "([^"]*)"$/, async function (by, title, text) {
  const topic = await topicNamed(this, title);
  const author = await h.apiAs(this, by);
  const { status, json } = await author.call('POST', '/posts.json', { topic_id: String(topic.id), raw: text });
  const post = json && json.post ? json.post : json;
  if (status >= 400 || !post || !post.id) {
    throw friendly({ message: `The forum refused the reply of "${by}" to "${title}" (status ${status}): ${h.errorsOf(json).join(' ') || 'no reason given'}.`, hint: 'A reply needs 20 characters or more; a closed topic takes no reply.' });
  }
  h.deletePostAfter(this, post.id, topic.id);
});

/**
 * Delete what is left of a topic or a message with this title (from a run that
 * stopped before its clean-up), as the data administrator, so a scenario can
 * make it again.
 *
 * Example #1: Given there is no topic "A topic the member writes today"
 * Example #2: Given there is no topic "A message the member sends today"
 * Example #3: Given there is no topic "Question about the nightly backups"
 * Example #4: Given there is no topic "A topic made in the composer"
 * Example #5: Given there is no topic "A draft that is never posted"
 */
Given(/^there is no topic "([^"]*)"$/, async function (title) {
  const client = await h.dataAdmin(this);
  for (const topic of await h.topicsTitled(this, title)) {
    const res = await client.call('DELETE', `/t/${topic.id}.json`);
    if (res.status >= 400 && res.status !== 404) {
      throw friendly({ message: `The topic "${title}" (${topic.id}) could not be deleted: status ${res.status}.`, hint: 'The data administrator (worldParameters.dataAdmin) must be an admin of the forum.' });
    }
  }
});

/**
 * The forum has (or has no) topic with this title, as its search finds it for
 * the data administrator.
 *
 * Example #1: Then there should be a topic "A topic the member writes today"
 * Example #2: Then there should be no topic "A draft that is never posted"
 * Example #3: Then there should be a topic "How to install the product on a laptop"
 * Example #4: Then there should be a topic "A message the member sends today"
 * Example #5: Then there should be no topic "A topic that was deleted"
 */
Then(/^there should be (a|no) topic "([^"]*)"$/, async function (which, title) {
  const wanted = which === 'a';
  const found = await h.eventually(this, () => h.topicsTitled(this, title), (list) => (list.length > 0) === wanted, async (list) => ({
    message: wanted ? `The forum has no topic "${title}".` : `The forum still has the topic "${title}" (${list.map((t) => t.id).join(', ')}).`,
    hint: 'The search of the forum finds a topic by its title a moment after it is made or deleted.',
  }), 10000);
  return found;
});

module.exports = { makeTopic, topicNamed };
