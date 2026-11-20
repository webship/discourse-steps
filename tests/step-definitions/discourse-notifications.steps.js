'use strict';

// Mentions and the notifications menu: the user menu of the header, its tabs,
// its notifications, the count on the avatar.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./discourse-helpers');
const { openUserMenu } = require('./discourse-session.steps');

/** The notifications of the open user menu: [{ type, title, text, unread, href }]. */
async function notifications(page) {
  return page.locator('.user-menu li.notification').evaluateAll((items) => items.filter((li) => li.getClientRects().length).map((li) => {
    const a = li.querySelector('a');
    return {
      type: a ? (a.getAttribute('title') || '') : '',
      text: li.textContent.replace(/\s+/g, ' ').trim(),
      unread: li.classList.contains('unread'),
      href: a ? a.getAttribute('href') : '',
      classes: li.className,
    };
  }));
}

/**
 * Open the notifications menu of the header (the avatar), on one of its tabs
 * when given ("Replies", "Likes", "Personal messages", "Bookmarks", "Other
 * notifications").
 *
 * Example #1: When I open the notifications menu
 * Example #2: When I open the "Personal messages" tab of the notifications menu
 * Example #3: When I open the "Replies" tab of the notifications menu
 * Example #4: When we open the notifications menu
 * Example #5: When I open the "Likes" tab of the notifications menu
 */
When(/^(?:I|we) open the (?:"([^"]*)" tab of the )?notifications menu$/, async function (tab) {
  await openUserMenu(this);
  if (tab) {
    const tabs = this.page.locator('.user-menu [role="tablist"] [role="tab"]');
    const n = await tabs.count();
    const names = [];
    for (let i = 0; i < n; i += 1) {
      const name = h.clean(await tabs.nth(i).getAttribute('aria-label').catch(() => '')) || h.clean(await tabs.nth(i).innerText());
      names.push(name.replace(/\s+-\s+\d+ .*$/, ''));
      if (h.normal(name).startsWith(h.normal(tab))) {
        await h.press(tabs.nth(i));
        await h.forumReady(this);
        return;
      }
    }
    throw friendly({ message: `The notifications menu has no tab "${tab}". It has ${h.listed(names)}.`, hint: 'The tabs are named as their buttons read for a screen reader: "All notifications", "Replies", "Likes", "Personal messages", "Bookmarks", "Other notifications", "Profile".' });
  }
});

/**
 * The open notifications menu lists a notification: the account that acted and
 * the topic, as the menu reads ("moderator A topic the suite reads today"), of a
 * kind when given (as the forum names it: "mentioned", "new reply", "new
 * personal message", "liked").
 *
 * Example #1: Then the notifications menu should list "moderator A topic with a mention in it"
 * Example #2: Then the notifications menu should list a "mentioned" notification for "A topic with a mention in it"
 * Example #3: Then the notifications menu should list a "new reply" notification for "A topic the suite reads today"
 * Example #4: Then the notifications menu should list a "new personal message" notification for "A message the member reads today"
 * Example #5: Then the notifications menu should list "administrator Your account on the test forum"
 */
Then(/^the notifications menu should list (?:"([^"]*)"|a "([^"]*)" notification for "([^"]*)")$/, async function (text, kind, topic) {
  const page = this.page;
  if (!(await page.locator('.user-menu.revamped').isVisible().catch(() => false))) await openUserMenu(this);
  const wanted = (n) => (text ? h.mentions(n.text, text) : (h.same(n.type, kind) && h.mentions(n.text, topic)));
  await h.eventually(this, () => notifications(page), (list) => list.some(wanted), async (list) => ({
    message: `The notifications menu does not list ${text ? `"${text}"` : `a "${kind}" notification for "${topic}"`}. It lists ${h.listed(list.map((n) => `${n.type}: ${n.text}`), 8)}.`,
    hint: 'The forum notifies a mention, a reply or a message a moment after it is posted (a job of the forum); the menu shows the newest first.',
  }), 15000);
});

/**
 * Open a notification of the open notifications menu by its text (the topic's
 * title); the forum opens the topic at the post it is about.
 *
 * Example #1: When I open the notification "A topic with a mention in it"
 * Example #2: When I open the notification "A message the member reads today"
 * Example #3: When we open the notification "A topic the suite reads today"
 * Example #4: When I open the notification "Your account on the test forum"
 * Example #5: When I open the notification "moderator A topic with a mention in it"
 */
When(/^(?:I|we) open the notification "([^"]*)"$/, async function (text) {
  const page = this.page;
  if (!(await page.locator('.user-menu.revamped').isVisible().catch(() => false))) await openUserMenu(this);
  const list = await h.eventually(this, () => notifications(page), (l) => l.some((n) => h.mentions(n.text, text)), async (l) => ({ message: `The notifications menu has no notification "${text}". It lists ${h.listed(l.map((n) => n.text), 8)}.`, hint: 'Name the notification by the title of its topic.' }), 15000);
  const index = list.findIndex((n) => h.mentions(n.text, text));
  await h.press(page.locator('.user-menu li.notification').nth(index).locator('a').first());
  await page.waitForURL(/\/t\//, { timeout: h.budget(this) }).catch(() => {});
  await h.forumReady(this);
});

/**
 * The avatar of the header shows the count of new notifications: its badge's
 * own words ("2 new message notifications"), or none.
 *
 * Example #1: Then the avatar should show "1 new message notification"
 * Example #2: Then the avatar should show "2 new message notifications"
 * Example #3: Then the avatar should show no new notification
 * Example #4: Then the avatar should show "new message notification"
 * Example #5: Then the avatar should show "unread notification"
 */
Then(/^the avatar should show (?:"([^"]*)"|no new notification)$/, async function (expected) {
  const page = this.page;
  const read = () => page.locator('#toggle-current-user .badge-notification').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent.trim()));
  if (expected == null) {
    await h.eventually(this, read, (l) => l.length === 0, async (l) => ({ message: `The avatar shows ${h.listed(l)}.`, hint: 'Opening the notifications menu marks the new notifications seen.' }), 8000);
    return;
  }
  await h.eventually(this, read, (l) => l.some((t) => h.mentions(t, expected)), async (l) => ({
    message: `The avatar does not show "${expected}". It shows ${h.listed(l)}.`,
    hint: 'The badge on the avatar counts the new notifications (messages first); it updates through the message bus a moment after the forum notifies.',
  }), 15000);
});

module.exports = { notifications };
