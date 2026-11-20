@review
Feature: The review queue
  As a moderator of the forum
  I want the posts the members flag to wait for me in the review queue
  So that I decide on each of them

  Scenario: A flagged post waits in the review queue until the moderator keeps it
    Given there is a topic "A topic with a post for the review queue" in "General" by "moderator"
    And "administrator" replied to the topic "A topic with a post for the review queue" with "A reply the member flags as off-topic for the review queue."
    And I am a logged in user with the "member" user
    When I open the topic "A topic with a post for the review queue"
    And I flag post 2 as "It's Off-Topic"
    Given I am a logged in user with the "moderator" user
    When I go to the review queue
    Then the review queue should list the flagged post "A reply the member flags as off-topic for the review queue."
    When I answer "Keep post" to the flagged post "A reply the member flags as off-topic for the review queue."
    And I go to the review queue
    Then the review queue should not list the flagged post "A reply the member flags as off-topic for the review queue."
