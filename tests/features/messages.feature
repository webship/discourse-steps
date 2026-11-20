@messages
Feature: Personal messages
  As a member of the forum
  I want to send a personal message and read the ones I get
  So that I can talk to one person without a public topic

  Scenario: The member sends a message to the moderator
    Given there is no topic "A message the member sends today"
    And I am a logged in user with the "member" user
    When I send the message "A message the member sends today" to "moderator" with "A personal message written by the suite for this scenario."
    Then I should be reading the topic "A message the member sends today"
    And the message should be between "member" and "moderator"
    When I go to my "Sent" messages
    Then my messages should list "A message the member sends today"
    Given I am a logged in user with the "moderator" user
    When I go to my messages
    Then my messages should list "A message the member sends today"

  Scenario: The member reads a message in the inbox
    Given there is a message "A message the member reads today" from "moderator" to "member"
    And I am a logged in user with the "member" user
    When I go to my messages
    Then my messages should list "A message the member reads today"
    And my messages should list "Your account on the test forum"
    When I open "A message the member reads today" from the list
    Then the message should be between "moderator" and "member"

  Scenario: A new user may not send a message
    Given I am a logged in user with the "newuser" user
    When I go to my messages
    Then I should not be able to start a message
