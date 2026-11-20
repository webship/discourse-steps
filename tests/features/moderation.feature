@moderation
Feature: The moderator's actions on a topic
  As a moderator of the forum
  I want to close, pin and unlist topics
  So that the forum stays tidy

  Scenario: The moderator closes a topic and opens it again
    Given there is a topic "A topic for the moderator to close" in "General" by "member"
    And I am a logged in user with the "moderator" user
    When I open the topic "A topic for the moderator to close"
    And I close the topic
    Then the topic should be closed
    And the topic should show the action "Closed"
    When I open the topic again
    Then the topic should be open
    And the topic should show the action "Opened"

  Scenario: The moderator pins a topic, and unpins it
    Given there is a topic "A topic for the moderator to pin" in "General" by "member"
    And I am a logged in user with the "moderator" user
    When I open the topic "A topic for the moderator to pin"
    And I pin the topic until "Next month"
    Then the topic should be pinned
    And the topic should show the action "Pinned"
    When I unpin the topic
    Then the topic should not be pinned
    And the topic should show the action "Unpinned"

  Scenario: The pin dialog asks until when
    Given there is a topic "A topic the moderator does not pin" in "General" by "member"
    And I am a logged in user with the "moderator" user
    When I open the topic "A topic the moderator does not pin"
    And I try to pin the topic without a time
    Then the pin dialog should show the error "A date is required to pin this topic."
    And the topic should not be pinned

  Scenario: The moderator unlists a topic, and lists it again
    Given there is a topic "A topic for the moderator to unlist" in "General" by "member"
    And I am a logged in user with the "moderator" user
    When I open the topic "A topic for the moderator to unlist"
    And I unlist the topic
    Then the topic should be unlisted
    And the topic should show the action "Unlisted"
    Given I am a logged in user with the "member" user
    When I go to the "Latest" topic list
    Then the topic list should not show "A topic for the moderator to unlist"
    Given I am a logged in user with the "moderator" user
    When I open the topic "A topic for the moderator to unlist"
    And I list the topic again
    Then the topic should be listed

  Scenario: A member has no topic admin menu
    Given I am a logged in user with the "member" user
    When I open the topic "Ideas for the next community meetup"
    Then I should not see the topic admin menu
