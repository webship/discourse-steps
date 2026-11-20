@composer
Feature: The composer
  As a member of the forum
  I want to write a topic with its category and tags, preview it and keep a draft
  So that I post what I mean, when I am ready

  Scenario: The member creates a topic in a category, with a tag
    Given there is no topic "A topic the member writes today"
    And I am a logged in user with the "member" user
    When I open the composer for a new topic
    And I write the title "A topic the member writes today" in the composer
    And I choose the category "Support" in the composer
    And I add the tag "howto" in the composer
    And I write "The body of a topic the member writes with the composer, for this scenario." in the composer
    And I submit the composer
    Then I should be reading the topic "A topic the member writes today"
    And post 1 should read "The body of a topic the member writes with the composer"
    And there should be a topic "A topic the member writes today"

  Scenario: The preview shows the text as the post will read
    Given I am a logged in user with the "member" user
    When I open the composer for a new topic
    And I show the composer preview
    And I write "A topic body with **bold words** for the preview of the composer." in the composer
    Then the composer preview should show "bold words" in bold
    And the composer preview should show "for the preview of the composer"
    When I discard the composer
    Then the composer should be closed

  Scenario: A draft is saved, closed and resumed
    Given I am a logged in user with the "member" user
    When I open the composer for a new topic
    And I write the title "A draft that is never posted" in the composer
    And I write "The body of a draft that the suite saves and resumes." in the composer
    And I save the draft and close the composer
    Then the composer should be closed
    When I reload the page
    And I resume the draft "A draft that is never posted"
    Then the composer should have the title "A draft that is never posted"
    And the composer should show "The body of a draft that the suite saves and resumes."
    When I discard the composer
    Then there should be no topic "A draft that is never posted"

  Scenario: The composer refuses a title and a body that are too short
    Given I am a logged in user with the "member" user
    When I open the composer for a new topic
    And I write the title "Too short" in the composer
    And I write "Short" in the composer
    And I try to submit the composer
    Then the composer should show the error "Title must be at least 15 characters"
    And the composer should show the error "Post must be at least 20 characters"
    When I discard the composer
    Then the composer should be closed
