@must-fail
Feature: Assertions of a topic, the search and the profile that must fail
  Each scenario asserts something that is not true on the test forum: its last step must fail with
  the message its description announces, and a hint. tests/check-must-fail.js runs them.

  Scenario: The wrong author of a post
    Fails with: Post #2 is by moderator, not member.
    Given I am not logged in
    When I open the topic "Favourite keyboard shortcuts of the team"
    Then post 2 should be by "member"

  Scenario: The wrong text of a post
    Fails with: Post #1 does not read "a text nobody wrote".
    Given I am not logged in
    When I open the topic "Favourite keyboard shortcuts of the team"
    Then post 1 should read "a text nobody wrote"

  Scenario: The wrong number of posts
    Fails with: shows 4 posts, not 9.
    Given I am not logged in
    When I open the topic "Favourite keyboard shortcuts of the team"
    Then the topic should have 9 posts

  Scenario: The wrong number of likes
    Fails with: Post #1 shows 3 likes, not 5.
    Given I am not logged in
    When I open the topic "How to install the product on a laptop"
    Then post 1 should have 5 likes

  Scenario: A topic the forum does not have
    Fails with: The forum has no topic "A topic nobody wrote".
    Given I am not logged in
    When I open the topic "A topic nobody wrote"

  Scenario: The wrong count of the search
    Fails with: The search found 1 result ("1 result for keyboard"), not 4
    Given I am not logged in
    When I search the full page for "keyboard"
    Then the search should find 4 results

  Scenario: A result the quick search does not show
    Fails with: The quick search does not show "Favourite keyboard shortcuts of the team".
    Given I am not logged in
    And I am on the "Latest" topic list
    When I search for "backups"
    Then the quick search should show "Favourite keyboard shortcuts of the team"

  Scenario: The wrong name of a profile
    Fails with: The profile does not show the name "Somebody Else".
    Given I am not logged in
    When I open the profile of "member"
    Then the profile should show the name "Somebody Else"
