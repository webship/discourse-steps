@notifications
Feature: Mentions and the notifications menu
  As a member of the forum
  I want to be told when somebody mentions me or writes to me
  So that I answer the people who need me

  Scenario: A mention notifies the member, and the notification opens the topic
    Given there is a topic "A topic with a mention in it" in "General" by "moderator" with:
      | body | Hello @member, this topic mentions you for the notifications of the suite. |
    And I am a logged in user with the "member" user
    When I open the notifications menu
    Then the notifications menu should list a "mentioned" notification for "A topic with a mention in it"
    And the notifications menu should list "moderator A topic with a mention in it"
    When I open the notification "A topic with a mention in it"
    Then I should be reading the topic "A topic with a mention in it"

  Scenario: A personal message shows on the avatar and in its own tab
    Given there is a message "A message the member reads today" from "moderator" to "member"
    And I am a logged in user with the "member" user
    Then the avatar should show "new message notification"
    When I open the "Personal messages" tab of the notifications menu
    Then the notifications menu should list a "new personal message" notification for "A message the member reads today"
