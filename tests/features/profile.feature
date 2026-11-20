@profile
Feature: The profile and the preferences
  As a member of the forum
  I want to see a profile and change my own preferences
  So that people know who I am

  Scenario: A profile shows the account's username and name
    Given I am not logged in
    When I open the profile of "member"
    Then the profile should show the username "member"
    And the profile should show the name "Member Webship"
    And the profile should show "read time"

  Scenario: The member changes a preference, and the profile shows it
    Given I am a logged in user with the "member" user
    When I go to my "Profile" preferences
    And I set the preference "Location" to "A test office of the suite"
    And I save my preferences
    Then I should see "Saved!"
    When I reload the page
    Then the preference "Location" should be "A test office of the suite"
    When I open the profile of "member"
    Then the profile should show "A test office of the suite"
