@lists
Feature: The topic lists
  As a reader of the forum
  I want the lists of topics to show what is there, what is new and what I have not read
  So that I find the conversations that matter to me

  @critical
  Scenario: Latest lists the topics of the forum, pinned first
    Given I am not logged in
    And I am on the "Latest" topic list
    Then the topic list should be "All latest topics"
    And the topic list should show the topics:
      | How to install the product on a laptop   |
      | Where are the nightly backups kept       |
      | Favourite keyboard shortcuts of the team |
    And the first topic of the list should be "Welcome to Webship test forum!"
    And the topic "Welcome to Webship test forum!" in the list should be pinned
    And the topic "Where are the nightly backups kept" in the list should be in the category "Support"
    And the topic "Where are the nightly backups kept" in the list should have the tag "backups"
    And the topic "Favourite keyboard shortcuts of the team" in the list should have 3 replies
    And the topic "The old server is retired this month" in the list should be closed
    And the topic list should not show "Your account on the test forum"

  Scenario: A new topic is new for the member until it is read, then a reply makes it unread
    Given there is a topic "A topic the suite reads today" in "General" by "moderator"
    And I am a logged in user with the "member" user
    When I go to the "New" topic list
    Then the topic list should show "A topic the suite reads today"
    And the topic "A topic the suite reads today" in the list should be new
    When I open "A topic the suite reads today" from the list
    And I read the topic
    And I set the notifications of the topic to "Tracking"
    Then the notifications of the topic should be "Tracking"
    When "moderator" replied to the topic "A topic the suite reads today" with "A reply the member has not read yet, for the unread list."
    And I go to the "Unread" topic list
    Then the topic list should be "All unread topics"
    And the topic "A topic the suite reads today" in the list should be unread

  Scenario: Top lists the topics with the most activity first
    Given I am not logged in
    When I go to the "Top" topic list
    Then the topic list should be "All top topics"
    And the first topic of the list should be "How to install the product on a laptop"

  Scenario: The categories page lists the categories and their subcategories
    Given I am not logged in
    When I go to the "Categories" topic list
    Then the categories page should list "Support" with the subcategory "Installation"
    And the categories page should list "Announcements"
    And the categories page should list "Off-topic"

  Scenario: A category's page lists its topics and those of its subcategories
    Given I am not logged in
    When I go to the category "Support"
    Then the topic list should be "Latest topics in Support"
    And the topic list should show "Where are the nightly backups kept"
    And the topic list should show "How to install the product on a laptop"
    And the topic list should not show "Favourite keyboard shortcuts of the team"

  Scenario: A tag's page lists its topics, and the tags page counts them
    Given I am not logged in
    When I go to the tag "howto"
    Then the topic list should be "Latest topics tagged howto"
    And the topic list should show "How to install the product on a laptop"
    And the topic list should not show "Where are the nightly backups kept"
    When I go to "/tags"
    Then the tags page should list "howto"
    And the tags page should list "release-notes" on 2 topics
