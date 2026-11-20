@must-fail
Feature: Assertions of the moderation and the admin that must fail
  Each scenario asserts something that is not true on the test forum: its last step must fail with
  the message its description announces, and a hint. tests/check-must-fail.js runs them.

  Scenario: The wrong state of a topic
    Fails with: The topic is open, not pinned and listed; it should be closed.
    Given I am a logged in user with the "moderator" user
    When I open the topic "Ideas for the next community meetup"
    Then the topic should be closed

  Scenario: An open topic that is closed
    Fails with: The topic is closed, not pinned and listed; it should be open.
    Given I am a logged in user with the "moderator" user
    When I open the topic "The old server is retired this month"
    Then the topic should be open

  Scenario: An admin menu a member does not have
    Fails with: The topic "Ideas for the next community meetup" offers no topic admin menu.
    Given I am a logged in user with the "member" user
    When I open the topic "Ideas for the next community meetup"
    And I close the topic

  Scenario: The wrong value of a site setting
    Fails with: The site setting "title" is "Webship test forum", not "Another forum".
    Given I am a logged in user with the "administrator" user
    When I search the site settings for "title"
    Then the site setting "title" should be "Another forum"

  Scenario: A dashboard section that does not exist
    Fails with: The admin dashboard shows no section "Sales figures".
    Given I am a logged in user with the "administrator" user
    When I go to the admin dashboard
    Then the admin dashboard should show "Sales figures"

  Scenario: A page the administrator is allowed to open
    Fails with: The forum let the account open /admin
    Given I am a logged in user with the "administrator" user
    Then I should not be allowed to open "/admin"

  Scenario: A preference that does not exist
    Fails with: The preferences page has no "Favourite colour".
    Given I am a logged in user with the "member" user
    When I go to my "Profile" preferences
    Then the preference "Favourite colour" should be "blue"
