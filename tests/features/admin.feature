@admin
Feature: The admin
  As the administrator of the forum
  I want the dashboard and the site settings, and nobody else to have them
  So that I run the forum

  Scenario: The administrator opens the dashboard
    Given I am a logged in user with the "administrator" user
    When I go to the admin dashboard
    Then the admin dashboard should show "Dashboard"
    And the admin dashboard should show "Site traffic"

  Scenario: The administrator searches the site settings
    Given I am a logged in user with the "administrator" user
    When I search the site settings for "title"
    Then the site settings should list "title"
    And the site settings should list "Min topic title length"
    And the site setting "title" should be "Webship test forum"
    And the site setting "min_topic_title_length" should be "15"
    When I search the site settings for "nothing is called like this"
    Then the site settings should list no setting

  # The browser logs the refused requests (403, 404) of these pages: no error of the forum.
  @js-off
  Scenario: A member and a new user may not open the admin or the review queue
    Given I am a logged in user with the "member" user
    Then I should not be allowed to open "/admin"
    And I should not be allowed to open "/review"
    Given I am a logged in user with the "newuser" user
    Then I should not be allowed to open "/admin/site_settings"
