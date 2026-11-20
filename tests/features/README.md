# Features

Reference features for the test forum that `.github/scripts/build-ddev-site.sh`
builds (or the Webship Workspace's builder, with `--install --add-users
--sample-data`): the forum's current release with its sample content (the
categories Announcements, Support with its subcategory Installation, and
Off-topic beside the forum's own; the tags howto, question, release-notes and
backups; seven topics with their replies and likes; a personal message to the
member) and the four accounts of `cucumber.js` (`administrator`, `moderator`,
`member`, `newuser`). Each scenario makes the topics, replies and messages it
needs through the forum's API and deletes them after it, with what it made on
screen, so a feature runs as it is on any such forum.

| Feature | Covers |
| --- | --- |
| `session` | A visitor offered the login, each account logging in through the form, a refused login, a session taken over, logging out. |
| `topic-lists` | Latest with its pinned topic, a topic's category, tag, replies and state; a topic new, read, then unread; Top; the categories page; a category's page; a tag's page and the tags page. |
| `topic` | Reading a topic and its posts; replying to the topic and to a post; quoting; liking and taking the like back; bookmarking and deleting the bookmark; flagging a post. |
| `composer` | A topic with a category and a tag; the preview; a draft saved, closed, resumed and discarded; the refusal of a title and a body too short. |
| `notifications` | A mention in the notifications menu, opened; a personal message on the avatar and in its tab. |
| `messages` | A message sent and found in Sent and in the recipient's inbox; a message read in the inbox; a new user who may not send one. |
| `search` | The quick search; the full search page and its count; no results; the advanced filters by category, tag and author. |
| `profile` | A profile's username, name and statistics; a preference changed, saved and shown on the profile. |
| `moderation` | Closing and opening, pinning and unpinning, unlisting and listing a topic; the pin dialog's refusal; no admin menu for a member. |
| `review` | A flagged post in the review queue, kept by the moderator. |
| `admin` | The dashboard; the site settings and their search; the admin and the review queue refused to a member and a new user. |

The assertions that must fail are in `tests/must-fail/` (`npm run test:must-fail`).
