@search
Feature: Search
  As a reader of the forum
  I want to search the topics, and narrow the search to a category, a tag or an author
  So that I find an answer without reading every topic

  @critical
  Scenario: The quick search finds a topic
    Given I am not logged in
    And I am on the "Latest" topic list
    When I search for "backups"
    Then the quick search should show "Where are the nightly backups kept"
    And the quick search should not show "How to install the product on a laptop"

  Scenario: The full search page counts and lists its results
    Given I am not logged in
    When I search the full page for "keyboard"
    Then the search should find 1 result
    And the search results should show "Favourite keyboard shortcuts of the team"

  Scenario: A search finds nothing
    Given I am not logged in
    When I search the full page for "zeppelinlike words nobody wrote"
    Then the search should find no results

  Scenario: The advanced filters narrow the search to a category, a tag and an author
    Given I am a logged in user with the "member" user
    When I search the full page for "laptop"
    And I filter the search by the category "Installation"
    Then the search field should read "laptop #support:installation"
    And the search results should show "How to install the product on a laptop"
    When I search the full page for "backups"
    And I filter the search by the tag "question"
    Then the search results should show "Where are the nightly backups kept"
    When I search the full page for "shortcut"
    And I filter the search by the author "moderator"
    Then the search results should show "Favourite keyboard shortcuts of the team"
