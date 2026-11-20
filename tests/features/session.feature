@session
Feature: The session
  As an account of the forum
  I want to log in, be refused with a wrong password and log out
  So that only the people of the forum act in it

  @critical
  Scenario: A visitor is offered the login
    Given I am not logged in
    Then I should not be logged in
    When I go to "/login"
    Then I should be on the login page

  Scenario Outline: The <account> account logs in through the login form
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"

    Examples:
      | account       |
      | administrator |
      | moderator     |
      | member        |
      | newuser       |

  # The browser logs nothing for a refused login: the forum answers it with 200 and a message.
  Scenario: A wrong password is refused
    When I log in with the username "member" and the password "Wrong-password-1"
    Then the login should be refused with "Incorrect username, email or password"
    And I should not be logged in

  Scenario: A session is taken over by the next scenario
    Given I am a logged in user with the "member" user
    Then I should be logged in as "member"
    Given I am a logged in user with the "moderator" user
    Then I should be logged in as "moderator"

  Scenario: An account logs out
    When I log in as "member" with the login form
    And I log out
    Then I should not be logged in
