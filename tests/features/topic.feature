@topic
Feature: A topic
  As a member of the forum
  I want to read a topic, reply to it, quote, like, bookmark and flag its posts
  So that I can take part in the conversation

  @critical
  Scenario: A visitor reads a topic and its replies
    Given I am not logged in
    When I open the topic "Favourite keyboard shortcuts of the team"
    Then I should be reading the topic "Favourite keyboard shortcuts of the team"
    And the topic should have 4 posts
    And post 1 should be by "member"
    And post 2 should be by "moderator"
    And post 2 should read "The question mark opens the list of every shortcut"
    And the last post should be by "member"

  Scenario: The member replies to a topic and to a post
    Given there is a topic "A topic the member replies to" in "General" by "moderator"
    And I am a logged in user with the "member" user
    When I open the topic "A topic the member replies to"
    And I reply to the topic with "A reply to the topic, written by the suite for this scenario."
    Then the topic should have 2 posts
    And the last post should be by "member"
    And the last post should read "written by the suite for this scenario"
    When I reply to post 1 with "A reply to the first post, written by the suite for this scenario."
    Then the topic should have 3 posts
    And the last post should read "A reply to the first post"

  # The forum takes out of a reply a quotation of the whole post just above it (the site setting
  # "remove full quote"), a moment after the reply is posted: the member quotes an earlier post.
  Scenario: The member quotes a post in a reply
    Given there is a topic "A topic the member quotes from" in "General" by "moderator"
    And "administrator" replied to the topic "A topic the member quotes from" with "A reply between the first post and the one that quotes it."
    And I am a logged in user with the "member" user
    When I open the topic "A topic the member quotes from"
    And I quote post 1 in a reply
    Then the composer should show "This topic was made by the test suite"
    When I add "I agree with this, and the suite says so in a quote." to the composer
    And I submit the composer
    Then the topic should have 3 posts
    And the last post should quote "moderator"
    And the last post should read "I agree with this"

  Scenario: The member likes a post, and takes the like back
    Given there is a topic "A topic the member likes" in "General" by "moderator"
    And I am a logged in user with the "member" user
    When I open the topic "A topic the member likes"
    Then post 1 should have no likes
    When I like post 1
    Then post 1 should be liked by me
    And post 1 should have 1 like
    When I remove my like from post 1
    Then post 1 should not be liked by me
    And post 1 should have no likes

  Scenario: The member bookmarks a post, and deletes the bookmark
    Given there is a topic "A topic the member bookmarks" in "General" by "moderator"
    And I am a logged in user with the "member" user
    When I open the topic "A topic the member bookmarks"
    And I bookmark post 1
    Then post 1 should be bookmarked
    When I delete the bookmark of post 1
    Then post 1 should not be bookmarked

  Scenario: The member flags a post as off-topic
    Given there is a topic "A topic with a post the member flags" in "General" by "moderator"
    And "moderator" replied to the topic "A topic with a post the member flags" with "A reply about something else entirely, for the flag."
    And I am a logged in user with the "member" user
    When I open the topic "A topic with a post the member flags"
    And I flag post 2 as "It's Off-Topic"
    Then post 2 should show "You flagged this as off-topic"
