@must-fail
Feature: Assertions of the session and the topic lists that must fail
  Each scenario asserts something that is not true on the test forum: its last step must fail with
  the message its description announces, and a hint. tests/check-must-fail.js runs them.

  Scenario: The wrong account
    Fails with: The browser is logged in as member, not as moderator ("moderator").
    Given I am a logged in user with the "member" user
    Then I should be logged in as "moderator"

  Scenario: The wrong reason for a refused login
    Fails with: The login page does not show "Your account is locked".
    When I log in with the username "member" and the password "Wrong-password-1"
    Then the login should be refused with "Your account is locked"

  Scenario: A visitor who is logged in
    Fails with: The forum does not know the browser as a logged-in account
    Given I am not logged in
    Then I should be logged in

  Scenario: A topic the list does not show
    Fails with: The topic list does not show "A topic nobody wrote".
    Given I am not logged in
    And I am on the "Latest" topic list
    Then the topic list should show "A topic nobody wrote"

  Scenario: The wrong heading of a list
    Fails with: The topic list is "All latest topics", not "All top topics".
    Given I am not logged in
    And I am on the "Latest" topic list
    Then the topic list should be "All top topics"

  Scenario: The wrong first topic
    Fails with: The first topic of the list is "Welcome to Webship test forum!", not "Where are the nightly backups kept".
    Given I am not logged in
    And I am on the "Latest" topic list
    Then the first topic of the list should be "Where are the nightly backups kept"

  Scenario: The wrong category of a topic
    Fails with: The topic "Where are the nightly backups kept" is in the category "Support", not "Off-topic".
    Given I am not logged in
    And I am on the "Latest" topic list
    Then the topic "Where are the nightly backups kept" in the list should be in the category "Off-topic"

  Scenario: The wrong number of replies
    Fails with: The topic "Favourite keyboard shortcuts of the team" shows 3 replies in the list, not 7.
    Given I am not logged in
    And I am on the "Latest" topic list
    Then the topic "Favourite keyboard shortcuts of the team" in the list should have 7 replies

  Scenario: A category the categories page does not list
    Fails with: The categories page does not list "Sales".
    Given I am not logged in
    When I go to the "Categories" topic list
    Then the categories page should list "Sales"
