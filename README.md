<p align="center"><img src="https://raw.githubusercontent.com/webship/discourse-steps/2.0.x/assets/logo.svg" alt="Discourse logo" width="96"></p>

# discourse-steps

[![Test](https://github.com/webship/discourse-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/discourse-steps/actions/workflows/test.yml)

Cucumber step definitions for testing a Discourse forum, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation
harness built on Playwright and Cucumber-js.

`@webship-js/discourse-steps` covers what every Discourse forum shows, whatever
its theme and its categories:

- **the session**: the login by a handle of the users registry (the session of
  an account is taken over from earlier in the run) or through the login form,
  its refusal, logging out, who is signed in;
- **the topic lists**: Latest, New, Unread, Top, Hot and Categories, their
  headings, the topics they show and in which order, a topic's category, tags,
  replies and state (new, unread, read, closed, pinned), a category's page, a
  tag's page and the tags page;
- **a topic**: reading it and its posts, replying to the topic or to a post,
  quoting a post, liking and taking the like back, bookmarking and deleting the
  bookmark, flagging a post, the topic's notification level;
- **the composer**: a new topic with its category and tags, writing and adding
  text, the Markdown preview, a draft saved, closed and resumed, discarding, the
  composer's refusals;
- **mentions and the notifications menu**: its tabs, its notifications by kind
  and by topic, opening one, the count on the avatar;
- **personal messages**: the inbox and the other lists, a new message with its
  recipients, who takes part in a message, an account that may not send one;
- **search**: the quick search, the full search page with its count, its results
  and its advanced filters (category, tag, author);
- **the profile and the preferences**: a profile's names and details, a
  preference changed, saved and kept;
- **the moderators' actions**: closing and opening, pinning and unpinning,
  unlisting and listing a topic, the pin dialog's refusal, the topic's state and
  the notes of the actions, the review queue and its answers;
- **the admin**: the dashboard, the site settings and their search, and the pages
  an account may not open;
- **test content**: a scenario makes the topics, replies and messages it needs
  through the forum's own API, as the account it names, and the steps delete them
  after it, with every topic, reply, like, bookmark and draft it makes on screen.

No step phrase names the platform: a scenario reads `When I flag post 2 as "It's
Off-Topic"` and `Then the topic should be closed`.

CI builds a real forum with [DDEV](https://ddev.com) on the runner, installed the
official way (the launcher of `discourse_docker`), at the current monthly release
and at the extended support release, with the accounts and the sample data of
[A test site](#a-test-site), and runs the whole suite against it twice on every
push and pull request, then the assertions that must fail; see
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, Python 3, and
Node.js 24 or later with npm. The forum runs in containers: no Ruby, PostgreSQL
or Redis on the machine, no public domain and no account anywhere. A forum needs
about 1.5 GB of free memory while it is built and about 1 GB once it runs.

**1. The forum.** The pack's own build script (the one CI runs) installs the
forum the official way: `discourse_docker`'s launcher bootstraps the forum's
image from the official base image and its standalone template (PostgreSQL,
Redis and the web server in one container), and a generic DDEV project runs that
image as a service, with the project's mail catcher for the forum's mail. Then
the accounts of [Test users](#test-users), the settings of a test site and the
sample data. It takes about five minutes the first time (the base image is about
1.3 GB).

```bash
git clone https://github.com/webship/discourse-steps.git
SITE_DIR="$PWD/discourse-site" discourse-steps/.github/scripts/build-ddev-site.sh
```

The forum answers at `https://discoursesteps.ddev.site`, its mail at
`https://discoursesteps.ddev.site:8026`. Its accounts are `administrator`,
`moderator`, `member` and `newuser`, each with the password `dD.123123ddd`
(step 3 names them).

In the [Webship Workspace](https://github.com/webship/workspace), its Discourse
plugin builds the same forum instead, in a sites folder of the workspace (`dev/`
here, the one `--with-needs` adds to a new workspace; `test/`, `sandboxes/` and
`demos/` work the same):

```bash
bash core/scripts/plugins.sh --require discourse --with-needs
bash core/scripts/plugins.sh --activate discourse --with-needs
bash core/scripts/plugins.sh --install discourse
bash dev/cmd-discourse-project.sh dssite --install --add-users --sample-data
```

That forum answers at `https://dssite.ddev.site`. `--sample-data` adds the
categories, tags, topics, replies and the message the features of this pack read.
Its accounts are the plugin's, the same four with the workspace's shared password
`dD.123123ddd`: `administrator`, `moderator`, `member` and `newuser`. The
workspace's own account is an admin too; the suite does not use it. The plugin's
README says how to manage the accounts with its Rails tool
(`cmd-tools-discourse-rails.sh dssite --add-users`): the dashboard's Users menu
does not know a forum.

**2. A test project.**

```bash
mkdir discourse-tests && cd discourse-tests
npm init -y
npm install --save-dev webship-js @webship-js/discourse-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/`
folders with a first feature and the `npm test` scripts, and installs Chromium.
npm usually runs it already when it installs webship-js; a second run changes
nothing. Its first feature opens the forum's home page: it passes, and can stay.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step
files of webship-js and of the pack, the tags that keep the assertions that must
fail out of a normal run, the address of the forum, the browser messages that are
no error of the forum, and the accounts (the JSON of [Test users](#test-users)).
The first lines are the starter's own: a feature named on the command line runs
alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/discourse-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://discoursesteps.ddev.site',
      // The account the test-content steps work as (an admin of `users`).
      dataAdmin: 'administrator',
      // No error of the forum: the passkey the login page asks a headless browser for, which it has
      // none of, and a request lost when the network of the machine changed.
      javascript: { mode: 'warn', levels: ['error'], ignore: "Resident credentials or empty 'allowCredentials' lists are not supported|net::ERR_NETWORK_CHANGED", beforeScenario: false, afterScenario: true },
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { username: 'administrator', email: 'administrator@example.com', password: 'dD.123123ddd' },
        moderator: { username: 'moderator', email: 'moderator@example.com', password: 'dD.123123ddd' },
        member: { username: 'member', email: 'member@example.com', password: 'dD.123123ddd' },
        newuser: { username: 'newuser', email: 'newuser@example.com', password: 'dD.123123ddd' },
      },
    },
  },
};
```

On a forum from the Webship Workspace (step 1) the accounts are the same; its
address goes in `LAUNCH_URL` (step 5).

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: The member logs in through the login form
    Given I am not logged in
    When I log in as "member" with the login form
    Then I should be logged in as "member"

  Scenario: The member reads a topic of the sample data
    Given I am a logged in user with the "member" user
    When I open the topic "Favourite keyboard shortcuts of the team"
    Then post 2 should be by "moderator"
```

The second scenario reads the sample data that both ways of step 1 make.

**5. Run it.** Set `LAUNCH_URL` to the address of the forum:
`https://discoursesteps.ddev.site` for the build script's forum,
`https://dssite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://discoursesteps.ddev.site npm test
```

A green first run prints every step, then the summary (the scenarios above and
the starter's, passed) and the HTML report it wrote:

```
3 scenarios (3 passed)
8 steps (8 passed)
0m09.264s (executing steps: 0m09.231s)
[webship-js] HTML report → …/discourse-tests/tests/reports/cucumber_report.html
```

One feature runs alone when the command line names it (a scenario too, with
its line):

```bash
LAUNCH_URL=https://discoursesteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they
also ship in the package, under
`node_modules/@webship-js/discourse-steps/tests/features/`). Together they use
every step of the pack. Each makes its own test topics, replies and messages and
deletes them after it. They run as they are on the forum of either way of step 1.

### What the suite tests

The features of this repository run every step of the pack against the test
forum, twice in a row in CI on every change, then the assertions that must fail:
a visitor offered the login, each account logging in through the form, a refused
login, a session taken over, logging out; Latest with its pinned topic and a
topic's category, tag, replies and state, a topic new for the member, read, then
unread after a reply, Top, the categories page, a category's page, a tag's page
and the tags page; a topic read with its posts, a reply to the topic and to a
post, a quotation, a like taken back, a bookmark deleted, a post flagged; a topic
made in the composer with its category and tag, the Markdown preview, a draft
saved, resumed and discarded, a title and a body refused; a mention in the
notifications menu and opened, a message on the avatar and in its tab; a message
sent and found by both accounts, a message read in the inbox, a new user who may
not send one; the quick search, the full search page and its count, no results,
the filters by category, tag and author; a profile, a preference saved and shown;
a topic closed and opened, pinned and unpinned, unlisted and listed, the pin
dialog's refusal, a member without the admin menu; a flagged post in the review
queue, kept; the dashboard, the site settings search, and the admin refused to a
member and a new user.

Every topic, reply and message a scenario makes is deleted after it (the forum
keeps deleted posts for its staff, as with any deletion), its likes, flags,
bookmarks and drafts are taken back, a preference and a topic's state are put
back: the lists, pages and inboxes of the forum are as the suite found them.

Not tested: the forum's other languages (a few steps read the forum's English
words: "Log In", "Log Out", "Save Changes", "Flag Post"), the sign-up of a new
account (a suite never creates one), the passkeys and the one-time login codes,
chat, uploads in the composer, the admin's other pages (users, groups,
customisation, plugins), and the forum's public API (webship-js's own API steps
cover it).

## Requirements

- Node.js 24 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A Discourse forum (2026.7 or later) with accounts for the suite (an admin
  among them, for the test-content steps)

## Install

```bash
npm install --save-dev @webship-js/discourse-steps
```

## How the steps find things and wait

- **By what a person reads.** A topic by its title, a post by its number (1 is
  the first post), an account by a handle of the users registry (its username on
  the forum), a category, a tag, a list or a menu item by the words on screen, a
  preference by the label over its field, a site setting by its name or its
  label. The forum's stable hooks are the fallback: the topic list's rows
  (`data-topic-id`), the posts (`data-post-number`), the composer
  (`#reply-control`), the choosers' rows (`data-name`).
- **The forum's own signals, no fixed sleeps.** The forum is a single-page app:
  while a page changes, the page loading slider at the top of the page shows
  "loading" (`.loading-indicator-container.loading`, the state of the forum's
  loading-slider service) until the page's data has come; then the forum
  announces the new page. The steps wait for that state to end and for the
  background requests of the page to answer, then for the answer of the request
  each action sends (`POST /posts` for a reply, `PUT /t/…/status` for a
  moderator's action, `POST /topics/timings` for the reading time of an
  account, `POST /drafts.json` for a draft), then for what the forum shows of
  the outcome (the post in the stream, the note of the action, "Saved!").
- **The message bus's long poll.** The forum keeps one request open at all times
  (`/message-bus/<client>/poll`, about 25 seconds, opened again at once): it is
  no work of the page. The steps never wait for it, and the pack takes it out of
  webship-js's request count, so its `wait for AJAX to finish` and its settle
  after a step work on the forum too.
- **Long timers.** The forum keeps timers that fire many seconds or minutes later
  (its polls, its presence, the renewal of the session). webship-js's settle
  counts every pending timer as work in progress, so on the forum it would wait
  out its whole budget after each step. The pack takes timers longer than five
  seconds out of that count, on every page of a scenario.
- **The sticky header.** The forum's header stays at the top of the window and
  would take a click meant for a button under it: the steps bring a post or a
  button to the middle of the window before they click it.
- **A cut request says so.** When the browser lost a request of the forum (a
  network change on the machine, another container starting), the step says the
  request was cut before the site answered, with a hint to run the scenario again
  (or to run the suite in the project's container), instead of blaming the
  scenario.
- **Failures say what was found.** `Post #2 is by moderator, not member.`,
  `The topic list does not show "…". It shows "…", "…".`, with a hint on where to
  look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list
the ones the forum has in `worldParameters.users`, by a handle the scenarios use,
each with its `username` (the forum logs in with it), its `email` and its
`password`. `worldParameters.dataAdmin` names the handle of an admin: the
test-content steps make and delete the test topics, replies and messages through
the forum's own API, as the account a step names, in sessions of their own (the
browser's session is never touched).

An account that logged in once keeps its session for the rest of the run
(`reuseSessions: false` turns it off); a logout ends it.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists
them in `worldParameters.users` (the default values; the `<HANDLE>_USERNAME`,
`<HANDLE>_EMAIL` and `<HANDLE>_PASSWORD` variables replace them). The build
script creates them; the Workspace's Discourse plugin creates the same four.

```json
{
  "administrator": { "username": "administrator", "email": "administrator@example.com", "password": "dD.123123ddd" },
  "moderator": { "username": "moderator", "email": "moderator@example.com", "password": "dD.123123ddd" },
  "member": { "username": "member", "email": "member@example.com", "password": "dD.123123ddd" },
  "newuser": { "username": "newuser", "email": "newuser@example.com", "password": "dD.123123ddd" }
}
```

`administrator` is an admin (made with the forum's own task, `rake admin:create`);
`moderator` is a moderator at trust level 2; `member` is at trust level 2 (the
forum's "member": replies, likes, flags and sends messages); `newuser` is at trust
level 0 (the forum's "new user", for the refusals). Their trust levels are locked,
so reading in a suite never promotes `newuser`. They are placeholder credentials
of a throwaway test forum, not of any real one.

## A test site

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh)
builds the forum the suite of this repository runs against:

- a generic DDEV project with no web server and no database of its own (the forum
  has its PostgreSQL and its Redis in its container), whose web container carries
  the mail catcher (Mailpit) the forum sends its mail to;
- `discourse_docker` (MIT) cloned, and a container definition written from its
  standalone sample: the templates of PostgreSQL, Redis and the web server, no
  port of the host (the router of DDEV serves the forum), no certificate of its
  own, without the rate limits of its web server (one test run comes from one
  address) and without the upgrade plugin; `version` is `DISCOURSE_VERSION`
  (`release`, the current monthly release, by default; `esr`, `latest` or a tag
  such as `v2026.10.2`);
- the launcher's bootstrap of the forum's image (the code at that release, its
  packages, the database migrated, the assets compiled), labelled as the
  project's, with its data in a volume labelled as the project's: `ddev delete`
  removes both;
- the image run as a service of the project (`/sbin/boot`, as the launcher
  starts it), the router sending `https://<project>.ddev.site` to its web server;
- the settings of a test site, through the forum's own Rails: the title
  "Webship test forum", no setup wizard, https links behind the router, no tips
  over a first visit, an admin's password of 10 characters or more (the shared
  password of the accounts), tags on, and the limits one test run meets because
  it comes from one address and posts many times in a few minutes (logins, posts,
  topics, likes, bookmarks, flags, edits and deletions per minute and per day):
  every limit a person meets stays;
- the administrator with the forum's own task (`rake admin:create`), then the
  other accounts, and the sample data: the categories Announcements, Support (with
  its subcategory Installation) and Off-topic beside the forum's own; the tags
  howto, question, release-notes and backups; seven topics with their replies
  ("How to install the product on a laptop", "Where are the nightly backups kept",
  "Favourite keyboard shortcuts of the team", "The old server is retired this
  month", which is closed, and others) and the likes of the first one; a personal
  message from the administrator to the member.

[`site/discourse-site.rb`](site/discourse-site.rb) writes all of it with the
forum's own Rails: the same script the Webship Workspace's Discourse plugin runs.
Run again with `ACCOUNTS_ONLY=1` and the same `SITE_DIR`, the build script gives
the accounts back their email, name, password, role and trust level; with
`SEED_ONLY=1`, it makes again what is missing of the sample data.

## Steps

107 steps in 11 files, every one with five examples in its JSDoc (`npm run test:examples` checks them).

| File | Steps | Covers |
| --- | --- | --- |
| `discourse-session.steps.js` | 9 | The session: logging in by a handle or through the form, a refused login, a visitor, logging out, who is signed in, the login page. |
| `discourse-lists.steps.js` | 14 | The topic lists, their headings and rows, a topic's category, tag, replies and state, opening a topic from a list, the categories page, a category's page, a tag's page, the tags page. |
| `discourse-topic.steps.js` | 17 | A topic: opening and reading it, its posts, replying, quoting, liking, bookmarking, flagging, reading it the way the forum counts it, its notification level. |
| `discourse-composer.steps.js` | 17 | The composer: a new topic, its title, category and tags, writing and adding text, sending, a refusal, the preview, a draft saved, resumed and discarded. |
| `discourse-notifications.steps.js` | 4 | The notifications menu and its tabs, a notification by kind and topic, opening one, the avatar's count. |
| `discourse-messages.steps.js` | 7 | Personal messages: the lists, a new message and its recipients, sending, who takes part, a refusal. |
| `discourse-search.steps.js` | 7 | The quick search, the full search page, its count and results, its advanced filters and its field. |
| `discourse-profile.steps.js` | 7 | A profile and its details, the preferences, a preference changed, saved and read. |
| `discourse-moderation.steps.js` | 13 | Closing, pinning and unlisting a topic and back, the pin dialog's refusal, the topic's state and its notes, the topic admin menu, the review queue and its answers. |
| `discourse-admin.steps.js` | 6 | The admin dashboard, the site settings and their search, a page an account may not open. |
| `discourse-data.steps.js` | 6 | Test topics, replies and messages made through the forum's API and deleted after the scenario; a topic that must or must not be there. |
| `discourse-helpers.js` | | Shared plumbing: the addresses, the forum's signals and the requests of a page, the long poll and the long timers, the cut request, the users registry and the session cache, the forum's API as an account, the clean-up, the menus, the choosers and the composer. It registers no step. |

Text, links, buttons, the status code of a page and the accessibility checks are webship-js's own steps (`I should see "..."`, `I click "Reply"`, `the page should have a main landmark`); this pack adds what the forum decides.

### `discourse-session.steps.js` (9)

- `Given I am a logged in user with the "member" user`
- `Given I am not logged in`
- `When I log in as "member" with the login form`
- `When I log in with the username "member" and the password "Wrong-password-1"`
- `Then the login should be refused with "Incorrect username, email or password"`
- `When I log out`
- `Then I should be logged in`
- `Then I should not be logged in`
- `Then I should be on the login page`

### `discourse-lists.steps.js` (14)

- `Given I am on the "Latest" topic list`
- `Then the topic list should be "All latest topics"`
- `Then the topic list should show "How to install the product on a laptop"`
- `Then the topic list should show the topics:`
- `Then the first topic of the list should be "How to install the product on a laptop"`
- `Then the topic list should be empty`
- `Then the topic "Where are the nightly backups kept" in the list should be in the category "Support"`
- `Then the topic "How to install the product on a laptop" in the list should have the tag "howto"`
- `Then the topic "Favourite keyboard shortcuts of the team" in the list should have 3 replies`
- `Then the topic "A topic the suite reads today" in the list should be new`
- `When I open "How to install the product on a laptop" from the list`
- `Then the categories page should list "Support"`
- `When I go to the category "Support"`
- `Then the tags page should list "howto"`

### `discourse-topic.steps.js` (17)

- `When I open the topic "How to install the product on a laptop"`
- `Then I should be reading the topic "How to install the product on a laptop"`
- `When I read the topic`
- `When I set the notifications of the topic to "Tracking"`
- `Then the notifications of the topic should be "Tracking"`
- `Then the topic should have 3 posts`
- `Then post 1 should be by "member"`
- `Then post 1 should read "Which keyboard shortcuts do you use every day?"`
- `When I reply to the topic with "A reply written by the suite for this scenario."`
- `When I quote post 2 in a reply`
- `Then the last post should quote "moderator"`
- `When I like post 2`
- `Then post 2 should have 1 like`
- `When I bookmark post 1`
- `Then post 1 should be bookmarked`
- `When I flag post 2 as "It's Off-Topic"`
- `Then post 2 should show "You flagged this as off-topic"`

### `discourse-composer.steps.js` (17)

- `When I open the composer for a new topic`
- `When I write the title "A topic the member writes today" in the composer`
- `When I write "A body written by the suite for this scenario." in the composer`
- `When I add "I agree with this answer." to the composer`
- `When I choose the category "Support" in the composer`
- `When I add the tag "howto" in the composer`
- `When I submit the composer`
- `When I try to submit the composer`
- `Then the composer should show the error "Title must be at least 15 characters"`
- `Then the composer should show "The body of a draft that the suite saves and resumes."`
- `Then the composer should have the title "A draft that is never posted"`
- `When I show the composer preview`
- `Then the composer preview should show "written by the suite"`
- `When I save the draft and close the composer`
- `When I resume the draft "A draft that is never posted"`
- `When I discard the composer`
- `Then the composer should be closed`

### `discourse-notifications.steps.js` (4)

- `When I open the notifications menu`
- `Then the notifications menu should list "moderator A topic with a mention in it"`
- `When I open the notification "A topic with a mention in it"`
- `Then the avatar should show "1 new message notification"`

### `discourse-messages.steps.js` (7)

- `When I go to my messages`
- `Then my messages should list "A message the member reads today"`
- `When I open the composer for a new message`
- `When I add the recipient "moderator" in the composer`
- `When I send the message "A message the member sends today" to "moderator" with "A message written by the suite for this scenario."`
- `Then the message should be between "member" and "moderator"`
- `Then I should not be able to start a message`

### `discourse-search.steps.js` (7)

- `When I search for "backups"`
- `Then the quick search should show "Where are the nightly backups kept"`
- `When I search the full page for "backups"`
- `When I filter the search by the category "Support"`
- `Then the search should find 1 result`
- `Then the search results should show "Where are the nightly backups kept"`
- `Then the search field should read "backups #support"`

### `discourse-profile.steps.js` (7)

- `When I open the profile of "member"`
- `Then the profile should show the name "Member Webship"`
- `Then the profile should show "Amman test office"`
- `When I go to my "Profile" preferences`
- `When I set the preference "Location" to "Amman test office"`
- `When I save my preferences`
- `Then the preference "Location" should be "Amman test office"`

### `discourse-moderation.steps.js` (13)

- `When I close the topic`
- `When I pin the topic until "Next month"`
- `When I pin the topic globally until "Two weeks"`
- `When I unpin the topic`
- `When I try to pin the topic without a time`
- `Then the pin dialog should show the error "A date is required to pin this topic."`
- `When I unlist the topic`
- `Then the topic should be closed`
- `Then the topic should show the action "Closed"`
- `Then I should not see the topic admin menu`
- `When I go to the review queue`
- `Then the review queue should list the flagged post "A reply the member flags as off-topic."`
- `When I answer "Keep post" to the flagged post "A reply the member flags as off-topic."`

### `discourse-admin.steps.js` (6)

- `When I go to the admin dashboard`
- `Then the admin dashboard should show "Site traffic"`
- `When I search the site settings for "title"`
- `Then the site settings should list "title"`
- `Then the site setting "title" should be "Webship test forum"`
- `Then I should not be allowed to open "/admin"`

### `discourse-data.steps.js` (6)

- `Given there is a topic "A topic the suite reads today" in "General" by "moderator"`
- `Given there is a topic "A topic with tags for the suite" in "Support" by "member" with:`
- `Given there is a message "A message the member reads today" from "moderator" to "member"`
- `Given "moderator" replied to the topic "A topic the suite reads today" with "A reply of the moderator for the suite."`
- `Given there is no topic "A topic the member writes today"`
- `Then there should be a topic "A topic the member writes today"`


## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads
the same on every system (one cucumber.js profile per system; the platform packs
are not meant to be loaded together). Loaded beside each of the 31 published
packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "member" user` | codeigniter, django, django-cms, drupal-core, joomla, laravel, mediawiki, moodle, nextjs, odoo, strapi, symfony, typo3, wordpress |
| `I log out`, `I should be logged in`, `I should be logged in as "member"`, `I should not be logged in` | backdrop-cms, codeigniter, django, django-cms, drupal-core, laravel, mediawiki, moodle, nextjs, odoo, strapi, symfony, typo3, wordpress |
| `I log in as "member" with the login form` | codeigniter, django, laravel, mediawiki, moodle, nextjs, strapi, symfony |
| `I am not logged in` | django, django-cms, drupal-core, joomla, odoo, strapi, typo3, wordpress |
| `I search for "…"` | docusaurus, drupal-core, mediawiki, wordpress |
| `the search should find 1 result`, `the search should find no results` | backdrop-cms, django, hubspot-cms, squarespace |
| `the login should be refused with "…"` | django, mediawiki, strapi |
| `I should not be allowed to open "…"` | django, django-cms, strapi |
| `I log in with the username "…" and the password "…"` | moodle, symfony |
| `I open "…" from the list` | django, strapi |
| `I save my preferences` | mediawiki |
| `I should be on the login page` | wordpress |

None matches a webship-js step, and none matches a phrase of the component pack
(Bootstrap) or of the Diffy pack, which can be loaded beside this one.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../discourse-site" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
```

## How the steps were written

Every step was written from a round of manual testing of a real local forum in
the browser first: each screen it touches was opened as the account the step
works as, its roles, labels and messages noted, and the signal it gives while it
loads or saves found (the page loading slider, the request each action sends,
the note or the message it shows). The failures of the first runs went back to
the browser before the step changed.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The Discourse logo in this README comes from Simple Icons 16.37.0 (CC0-1.0),
filled with the colour the set lists for the brand. The Discourse name and logo
are trademarks of their owner; this pack is not affiliated with or endorsed by
them.
