'use strict';

// The composer: a new topic with its title, category and tags, writing and
// adding text, the Markdown preview, the draft saved, closed and resumed, a
// refusal, discarding, and sending.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');

/**
 * Open the composer for a new topic with the "New Topic" button of a topic
 * list.
 *
 * Example #1: When I open the composer for a new topic
 * Example #2: When we open the composer for a new topic
 * Example #3: When I open the composer for a new topic
 *               Then the composer should be open
 * Example #4: When I open the composer for a new topic
 *               And I choose the category "Support" in the composer
 * Example #5: When I open the composer for a new topic
 *               And I write the title "A topic the member writes today" in the composer
 */
When(/^(?:I|we) open the composer for a new topic$/, async function () {
  const page = this.page;
  let button = page.locator('#create-topic').first();
  if (!(await button.isVisible().catch(() => false))) {
    await h.open(this, '/latest');
    button = page.locator('#create-topic').first();
  }
  if (!(await button.isVisible().catch(() => false))) {
    throw h.fail(this, `The page offers no "New Topic" button: ${await h.pageSummary(this)}.`, 'A visitor, or an account that may not create topics, has no "New Topic" button.');
  }
  await h.press(button);
  await h.waitForComposer(this, 'The composer of a new topic');
});

/**
 * Write the title of the topic or the message in the composer.
 *
 * Example #1: When I write the title "A topic the member writes today" in the composer
 * Example #2: When I write the title "A message the member sends today" in the composer
 * Example #3: When I write the title "Too short" in the composer
 * Example #4: When we write the title "A question about the installer" in the composer
 * Example #5: When I write the title "A draft that is never posted" in the composer
 */
When(/^(?:I|we) write the title "([^"]*)" in the composer$/, async function (title) {
  const field = this.page.locator('#reply-control #reply-title');
  if (!(await field.isVisible().catch(() => false))) throw h.fail(this, 'The composer has no title field.', 'A reply has no title; open the composer of a new topic or a new message.');
  await field.fill(title);
});

/**
 * Write a text in the composer's editor, in place of what it holds (the rich
 * text editor or the Markdown one, whichever the account uses).
 *
 * Example #1: When I write "A body written by the suite for this scenario." in the composer
 * Example #2: When I write "A reply with **bold words** written by the suite." in the composer
 * Example #3: When I write "Short" in the composer
 * Example #4: When we write "Hello @moderator, the suite mentions you here." in the composer
 * Example #5: When I write "The body of a draft that the suite saves and resumes." in the composer
 */
When(/^(?:I|we) write "([^"]*)" in the composer$/, async function (text) {
  if (!(await h.composerOpen(this.page))) throw h.fail(this, 'The composer is not open.', 'Open it first: "When I open the composer for a new topic", or reply to a topic.');
  await h.writeInComposer(this, text);
});

/**
 * Add a text at the end of what the composer holds (after a quotation).
 *
 * Example #1: When I add "I agree with this answer." to the composer
 * Example #2: When I add "Thanks for the tip." to the composer
 * Example #3: When we add "A second paragraph written by the suite." to the composer
 * Example #4: When I add "That is how I do it too." to the composer
 * Example #5: When I add "One more sentence after the quotation." to the composer
 */
When(/^(?:I|we) add "([^"]*)" to the composer$/, async function (text) {
  if (!(await h.composerOpen(this.page))) throw h.fail(this, 'The composer is not open.', 'Open it first, or quote a post.');
  await h.addToComposer(this, text);
});

/**
 * Choose the category of the new topic in the composer's category chooser.
 *
 * Example #1: When I choose the category "Support" in the composer
 * Example #2: When I choose the category "Off-topic" in the composer
 * Example #3: When I choose the category "Installation" in the composer
 * Example #4: When we choose the category "General" in the composer
 * Example #5: When I choose the category "Announcements" in the composer
 */
When(/^(?:I|we) choose the category "([^"]*)" in the composer$/, async function (name) {
  const kit = this.page.locator('#reply-control details.category-chooser').first();
  if (!(await kit.isVisible().catch(() => false))) throw h.fail(this, 'The composer has no category chooser.', 'A reply and a message have no category; open the composer of a new topic.');
  const offered = await h.choose(this, kit, name);
  if (offered) throw friendly({ message: `The category chooser offers no "${name}". It offers ${offered}.`, hint: 'The chooser lists the categories the account may post in.' });
});

/**
 * Add a tag to the new topic in the composer's tag chooser.
 *
 * Example #1: When I add the tag "howto" in the composer
 * Example #2: When I add the tag "question" in the composer
 * Example #3: When we add the tag "backups" in the composer
 * Example #4: When I add the tag "release-notes" in the composer
 * Example #5: When I add the tag "howto" in the composer
 *               And I add the tag "question" in the composer
 */
When(/^(?:I|we) add the tag "([^"]*)" in the composer$/, async function (tag) {
  const kit = this.page.locator('#reply-control details.mini-tag-chooser').first();
  if (!(await kit.isVisible().catch(() => false))) throw h.fail(this, 'The composer has no tag chooser.', 'An account below the trust level that may tag topics, or a forum without tags, has none.');
  const offered = await h.choose(this, kit, tag);
  if (offered) throw friendly({ message: `The tag chooser offers no "${tag}". It offers ${offered}.`, hint: 'The chooser lists the tags the account may use.' });
});

/**
 * Send what the composer holds: the topic, the reply or the message. The step
 * waits for the forum's answer and for the composer to close; a refusal fails
 * the step with the forum's message. What it makes is deleted after the
 * scenario.
 *
 * Example #1: When I submit the composer
 * Example #2: When we submit the composer
 * Example #3: When I submit the composer
 *               Then the composer should be closed
 * Example #4: And I submit the composer
 * Example #5: When I submit the composer
 *               Then I should be reading the topic "A topic the member writes today"
 */
When(/^(?:I|we) submit the composer$/, async function () {
  const { errors, json } = await h.submitComposer(this);
  if (errors.length) throw friendly({ message: `The forum refused what the composer sent: ${errors.join(' ')}`, hint: 'A title needs 15 characters or more and a post 20 or more; "When I try to submit the composer" checks a refusal.' });
  if (json && json.post && json.post.post_number === 1) {
    await this.page.waitForURL(new RegExp(`/t/[^/]+/${json.post.topic_id}`), { timeout: h.budget(this) }).catch(() => {});
    await h.forumReady(this);
  }
});

/**
 * Try to send what the composer holds, for a refusal: the composer's own
 * check, or the forum's answer. The next step reads the message.
 *
 * Example #1: When I try to submit the composer
 * Example #2: When we try to submit the composer
 * Example #3: And I try to submit the composer
 * Example #4: When I try to submit the composer
 *               Then the composer should show the error "Title must be at least 15 characters"
 * Example #5: When I try to submit the composer
 *               Then the composer should show the error "Sorry, you cannot send a personal message to that user."
 */
When(/^(?:I|we) try to submit the composer$/, async function () {
  this.__forumComposerErrors = (await h.submitComposer(this)).errors;
});

/**
 * The composer (or the forum's error dialog over it) shows a refusal.
 *
 * Example #1: Then the composer should show the error "Title must be at least 15 characters"
 * Example #2: Then the composer should show the error "Post must be at least 20 characters"
 * Example #3: Then the composer should show the error "Sorry, you cannot send a personal message to that user."
 * Example #4: Then the composer should show the error "must be at least 15 characters"
 * Example #5: Then the composer should show the error "Sorry, new users can only put"
 */
Then(/^the composer should show the error "([^"]*)"$/, async function (expected) {
  const page = this.page;
  await h.eventually(this, async () => [...(await h.composerErrors(page)), ...(this.__forumComposerErrors || [])], (list) => list.some((t) => h.mentions(t, expected)), async (list) => ({
    message: `The composer does not show the error "${expected}". It shows ${h.listed(list)}.`,
    hint: 'The composer checks a title and a body before it sends them (tips over the fields); the forum answers other refusals in a dialog "An error occurred: ...".',
  }), 8000);
  await h.closeErrorDialog(page);
});

/**
 * The composer's editor holds a text (a draft resumed, a quotation).
 *
 * Example #1: Then the composer should show "The body of a draft that the suite saves and resumes."
 * Example #2: Then the composer should show "The question mark opens the list"
 * Example #3: Then the composer should show "moderator"
 * Example #4: Then the composer should show "A reply written by the suite"
 * Example #5: Then the composer should show "bold words"
 */
Then(/^the composer should show "([^"]*)"$/, async function (expected) {
  await h.eventually(this, () => h.composerText(this.page), (t) => h.mentions(t, expected), async (t) => ({
    message: `The composer does not show "${expected}". It holds "${t.slice(0, 200)}".`,
    hint: 'The composer resumes a saved draft with its text; a quotation shows the quoted text.',
  }), 8000);
});

/**
 * The title field of the composer holds a title (a draft resumed).
 *
 * Example #1: Then the composer should have the title "A draft that is never posted"
 * Example #2: Then the composer should have the title "A topic the member writes today"
 * Example #3: Then the composer should have the title "A message the member sends today"
 * Example #4: Then the composer should have the title "A question about the installer"
 * Example #5: Then the composer should have the title "A draft that is never posted"
 *               And the composer should show "The body of a draft that the suite saves and resumes."
 */
Then(/^the composer should have the title "([^"]*)"$/, async function (expected) {
  const field = this.page.locator('#reply-control #reply-title');
  await h.eventually(this, () => field.inputValue().catch(() => ''), (v) => h.same(v, expected), async (v) => ({
    message: `The composer's title is "${v}", not "${expected}".`,
    hint: 'A new topic or a message has a title field at the top of the composer.',
  }), 8000);
});

/**
 * Show the composer's preview: the editor turns to Markdown (the rich text
 * editor has no preview) and the preview beside it shows what the forum will
 * make of the text.
 *
 * Example #1: When I show the composer preview
 * Example #2: When we show the composer preview
 * Example #3: And I show the composer preview
 * Example #4: When I show the composer preview
 *               Then the composer preview should show "bold words" in bold
 * Example #5: When I show the composer preview
 *               Then the composer preview should show "written by the suite"
 */
When(/^(?:I|we) show the composer preview$/, async function () {
  if (!(await h.composerOpen(this.page))) throw h.fail(this, 'The composer is not open.', 'Open it first.');
  const text = await h.composerText(this.page);
  await h.markdownWithPreview(this);
  // The rich text editor hands its text to the Markdown one; a text written before keeps its words.
  if (text && !(await h.composerText(this.page))) await h.writeInComposer(this, text);
});

/**
 * The composer's preview shows a text (in bold, when asked: the preview turns
 * Markdown's **...** into bold text).
 *
 * Example #1: Then the composer preview should show "written by the suite"
 * Example #2: Then the composer preview should show "bold words" in bold
 * Example #3: Then the composer preview should show "A reply with"
 * Example #4: Then the composer preview should show "important" in bold
 * Example #5: Then the composer preview should show "the preview"
 */
Then(/^the composer preview should show "([^"]*)"( in bold)?$/, async function (expected, bold) {
  const preview = this.page.locator('#reply-control .d-editor-preview').first();
  if (!(await preview.isVisible().catch(() => false))) throw h.fail(this, 'The composer shows no preview.', 'Show it first: "When I show the composer preview".');
  const read = () => preview.evaluate((p, b) => (b ? [...p.querySelectorAll('strong, b')].map((s) => s.textContent) : [p.textContent]), Boolean(bold));
  await h.eventually(this, read, (texts) => texts.some((t) => (bold ? h.same(t, expected) : h.mentions(t, expected))), async (texts) => ({
    message: `The composer preview does not show "${expected}"${bold ? ' in bold' : ''}. It shows ${h.listed(texts.map((t) => t.slice(0, 120)))}.`,
    hint: 'The preview renders the Markdown of the editor as the post will read.',
  }), 8000);
});

/**
 * Save what the composer holds as a draft and close it, with its "Save and
 * close" button; the step waits for the forum to keep the draft. The draft is
 * deleted after the scenario.
 *
 * Example #1: When I save the draft and close the composer
 * Example #2: When we save the draft and close the composer
 * Example #3: And I save the draft and close the composer
 * Example #4: When I save the draft and close the composer
 *               Then the composer should be closed
 * Example #5: When I save the draft and close the composer
 *               And I reload the page
 */
When(/^(?:I|we) save the draft and close the composer$/, async function () {
  const page = this.page;
  const button = page.locator('#reply-control button.toggle-save-and-close').first();
  if (!(await button.isVisible().catch(() => false))) throw h.fail(this, 'The composer has no "Save and close" button.', 'The composer must be open with a text in it.');
  await h.withRequest(this, (m, u) => m === 'POST' && /^\/drafts(\.json)?$/.test(new URL(u).pathname), () => h.press(button), { what: 'the draft (POST /drafts)' });
  await h.eventually(this, async () => !(await h.composerOpen(page)), Boolean, async () => ({ message: 'The composer stayed open after "Save and close".', hint: 'Look at the screenshot of the failure.' }), 8000);
  await h.forumReady(this);
});

/**
 * Resume a draft of a new topic from the drafts menu beside the "New Topic"
 * button, by its title; the composer opens with it.
 *
 * Example #1: When I resume the draft "A draft that is never posted"
 * Example #2: When we resume the draft "A draft that is never posted"
 * Example #3: When I resume the draft "A topic the member writes today"
 * Example #4: When I resume the draft "A question about the installer"
 * Example #5: When I resume the draft "A draft that is never posted"
 *               Then the composer should have the title "A draft that is never posted"
 */
When(/^(?:I|we) resume the draft "([^"]*)"$/, async function (title) {
  const page = this.page;
  let trigger = page.locator('button.topic-drafts-menu-trigger').first();
  if (!(await trigger.isVisible().catch(() => false))) {
    await h.open(this, '/latest');
    trigger = page.locator('button.topic-drafts-menu-trigger').first();
  }
  if (!(await trigger.isVisible().catch(() => false))) throw h.fail(this, 'The page has no drafts menu beside "New Topic".', 'The forum shows the drafts menu when the account has a saved draft.');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await h.press(trigger);
  const menu = await h.eventually(this, () => h.openMenu(page, 'topic-drafts-menu'), Boolean, async () => ({ message: 'The drafts menu did not open.', hint: 'Look at the screenshot of the failure.' }), 5000);
  const items = menu.locator('button');
  const n = await items.count();
  const names = [];
  for (let i = 0; i < n; i += 1) {
    const text = h.clean(await items.nth(i).innerText());
    names.push(text);
    if (h.mentions(text, title)) {
      await items.nth(i).click();
      await h.waitForComposer(this, 'The composer of the draft');
      return;
    }
  }
  await page.keyboard.press('Escape');
  throw friendly({ message: `The drafts menu has no draft "${title}". It has ${h.listed(names)}.`, hint: 'The menu lists the latest drafts of the account by their titles.' });
});

/**
 * Discard what the composer holds (the forum asks to confirm; the draft goes
 * too).
 *
 * Example #1: When I discard the composer
 * Example #2: When we discard the composer
 * Example #3: And I discard the composer
 * Example #4: When we discard the composer
 *               Then the composer should be closed
 * Example #5: When I discard the composer
 *               Then there should be no topic "A draft that is never posted"
 */
When(/^(?:I|we) discard the composer$/, async function () {
  await h.discardComposer(this);
});

/**
 * Whether the composer is open or closed.
 *
 * Example #1: Then the composer should be closed
 * Example #2: Then the composer should be open
 * Example #3: But the composer should be closed
 * Example #4: Then the composer should be open
 *               And the composer should have the title "A draft that is never posted"
 * Example #5: And the composer should be closed
 */
Then(/^the composer should be (open|closed)$/, async function (state) {
  await h.eventually(this, () => h.composerOpen(this.page), (v) => v === (state === 'open'), async () => ({
    message: `The composer is ${state === 'open' ? 'closed' : 'open'}.`,
    hint: 'The composer is the panel at the bottom of the page.',
  }), 8000);
});
