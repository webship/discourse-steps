#!/usr/bin/env bash
# Builds the forum the suite runs against, in a DDEV project: the current
# release of the forum software (GPL-2.0), installed the official way, with the
# launcher of discourse_docker (MIT), and run as a service of the project:
#
#   - discourse_docker's launcher bootstraps the forum's image from the
#     official base image and its standalone templates (PostgreSQL, Redis and
#     the web server in one container, the database in a volume of the
#     project); no public domain, no certificate of its own: the router of the
#     container tool serves https://<project>.ddev.site and sends it to the
#     forum's port;
#   - the web container of the project serves nothing of its own: it carries
#     the local mail catcher (Mailpit), which the forum sends its mail to, and
#     the Node.js the Webship Workspace runs a test suite with;
#   - the administrator is made with the forum's own task (rake admin:create),
#     the other accounts, the settings of a test site and the sample content
#     with site/discourse-site.rb, run by the forum's Rails.
#
# Settings (environment variables, all optional):
#   PROJECT_NAME        the DDEV project name                    (default discoursesteps)
#   SITE_DIR            the project folder                       (default a new temporary folder)
#   DISCOURSE_VERSION   the release to install: a tag (v2026.10.2), or a
#                       channel: release (the current monthly release), esr
#                       (the extended support release) or latest  (default release)
#   DISCOURSE_DOCKER_REF  the branch or tag of discourse_docker   (default main)
#   ACCOUNT_PASSWORD    the password of the accounts below        (default dD.123123ddd)
#   ACCOUNTS_ONLY       1: build nothing, give the accounts of the forum in
#                       SITE_DIR back their password, email, role and trust level
#   SEED_ONLY           1: build nothing, put the sample content of the forum
#                       in SITE_DIR back as the build made it
#
# The accounts are configuration: this script creates them and cucumber.js
# names them; the features never create or delete one.
#   administrator  administrator@example.com  admin (made with rake admin:create)
#   moderator      moderator@example.com      moderator, trust level 2
#   member         member@example.com         trust level 2 ("member")
#   newuser        newuser@example.com        trust level 0 ("new user"), for the refusals
#
# Nothing is installed that the standalone template does not install: no paid
# plan, no hosted service, no account anywhere.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-discoursesteps}"
DISCOURSE_VERSION="${DISCOURSE_VERSION:-release}"
DISCOURSE_DOCKER_REF="${DISCOURSE_DOCKER_REF:-main}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../site" && pwd)/discourse-site.rb"
HOST="${PROJECT_NAME}.ddev.site"
# The forum's image (the launcher names it local_discourse/<container>) and its
# data volume. Both carry the project's label, so `ddev delete` removes them.
IMAGE="local_discourse/${PROJECT_NAME}"
VOLUME="ddev-${PROJECT_NAME}-discourse-shared"

# The accounts travel as base64 of a JSON object, so no password is written into
# a file of the project and no quoting can break a value.
accounts_payload() {
  ACCOUNT_PASSWORD="$ACCOUNT_PASSWORD" python3 -c '
import base64, json, os
p = os.environ["ACCOUNT_PASSWORD"]
accounts = [
  {"handle": "administrator", "username": "administrator", "name": "Administrator Webship", "email": "administrator@example.com", "password": p, "role": "admin", "trust_level": 4},
  {"handle": "moderator", "username": "moderator", "name": "Moderator Webship", "email": "moderator@example.com", "password": p, "role": "moderator", "trust_level": 2},
  {"handle": "member", "username": "member", "name": "Member Webship", "email": "member@example.com", "password": p, "role": "member", "trust_level": 2},
  {"handle": "newuser", "username": "newuser", "name": "New User Webship", "email": "newuser@example.com", "password": p, "role": "member", "trust_level": 0},
]
print(base64.b64encode(json.dumps({"owner": accounts[0], "accounts": accounts}).encode()).decode())'
}

# discourse-site.rb with the forum's Rails, in its container. The accounts go in
# on the standard input, as a first line before the script: on no command line a
# failed run prints. The verbs travel in an environment variable.
site_script() {
  { printf "\$discourse_site_accounts = '%s'\n" "$(accounts_payload)"; cat "$SCRIPT"; } \
    | ddev exec -s discourse "DISCOURSE_SITE_VERBS='$*' rails runner -"
}

wait_for_forum() {
  local status=""
  for attempt in $(seq 1 150); do
    status="$(ddev exec -s discourse "curl -s http://127.0.0.1/srv/status" < /dev/null 2>/dev/null | tr -d '\r' || true)"
    [ "$status" = "ok" ] && return 0
    sleep 2
  done
  echo "The forum did not answer (last answer: ${status:-none}); the end of its log:" >&2
  ddev logs -s discourse --tail 80 < /dev/null >&2 || true
  ddev exec -s discourse "tail -n 80 /shared/log/rails/production.log /shared/log/rails/unicorn.stderr.log" < /dev/null >&2 || true
  return 1
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  site_script accounts
  exit 0
fi
if [ "${SEED_ONLY:-}" = "1" ]; then
  site_script seed
  exit 0
fi

# A project of this name from an earlier build goes first, with its forum's
# container, image and volume (they carry the project's label).
if ddev describe "$PROJECT_NAME" > /dev/null 2>&1; then
  ddev delete -Oy "$PROJECT_NAME" < /dev/null
fi

# A generic project: no web server and no database of the container tool's own
# (the forum has its PostgreSQL and its Redis in its container), Node.js 24 for
# a test suite run in the web container.
ddev config --project-type=generic --webserver-type=generic --docroot="" --project-name="$PROJECT_NAME" \
  --omit-containers=db --nodejs-version=24

# discourse_docker: the launcher and the templates.
rm -rf discourse_docker
git clone --quiet --depth 1 --branch "$DISCOURSE_DOCKER_REF" https://github.com/discourse/discourse_docker.git discourse_docker

# The container definition: the standalone sample without the ports on the host
# (the router of the container tool serves the forum), without the rate limits
# of its web server (one test run comes from one address), and without the
# upgrade plugin (an upgrade is a new build). The label is the project's, so the
# image the launcher commits is removed with the project.
cat > "discourse_docker/containers/${PROJECT_NAME}.yml" <<YAMLEOF
## The forum of the DDEV project ${PROJECT_NAME}, for the webship-js step pack's
## suite. Written by its build script; build again rather than editing by hand.
templates:
  - "templates/postgres.template.yml"
  - "templates/redis.template.yml"
  - "templates/web.template.yml"

expose: []

docker_args: "--label com.docker.compose.project=ddev-${PROJECT_NAME}"

params:
  db_default_text_search_config: "pg_catalog.english"
  db_shared_buffers: "256MB"
  version: ${DISCOURSE_VERSION}

env:
  LC_ALL: en_US.UTF-8
  LANG: en_US.UTF-8
  LANGUAGE: en_US.UTF-8
  UNICORN_WORKERS: 2
  DISCOURSE_HOSTNAME: "${HOST}"
  DISCOURSE_DEVELOPER_EMAILS: "administrator@example.com"
  DISCOURSE_SMTP_ADDRESS: web
  DISCOURSE_SMTP_PORT: 1025
  DISCOURSE_SMTP_ENABLE_START_TLS: false
  DISCOURSE_NOTIFICATION_EMAIL: noreply@example.com
  DISCOURSE_MAX_REQS_PER_IP_MODE: none

volumes:
  - volume:
      host: ${VOLUME}
      guest: /shared
YAMLEOF
chmod o-rwx "discourse_docker/containers/${PROJECT_NAME}.yml"

# The data volume, labelled as the container tool's own: the launcher fills it
# (the database), the project mounts it, `ddev delete` removes it.
docker volume rm "$VOLUME" > /dev/null 2>&1 || true
docker volume create --label "com.docker.compose.project=ddev-${PROJECT_NAME}" \
  --label "com.docker.compose.volume=discourse-shared" "$VOLUME" > /dev/null

mkdir -p .ddev
cat > .ddev/config.discourse.yaml <<YAMLEOF
# The forum of this project: a service of its own (docker-compose.discourse.yaml).
# Written by the build script; build again rather than editing by hand.
web_environment:
  - DISCOURSE_VERSION=${DISCOURSE_VERSION}
YAMLEOF
cat > .ddev/docker-compose.discourse.yaml <<YAMLEOF
## The forum, as a service of this project: the image discourse_docker's
## launcher bootstrapped (${IMAGE}), started the way the launcher starts it
## (/sbin/boot), its data in the project's volume. The router sends the
## project's address to its web server. Written by the build script.
services:
  discourse:
    container_name: ddev-\${DDEV_SITENAME}-discourse
    image: ${IMAGE}
    restart: "no"
    command: /sbin/boot
    shm_size: 512m
    labels:
      com.ddev.site-name: \${DDEV_SITENAME}
      com.ddev.approot: \${DDEV_APPROOT}
    environment:
      - VIRTUAL_HOST=\$DDEV_HOSTNAME
      - HTTP_EXPOSE=80:80
      - HTTPS_EXPOSE=443:80
      - DISCOURSE_HOSTNAME=${HOST}
      - DISCOURSE_SMTP_ADDRESS=web
      - DISCOURSE_SMTP_PORT=1025
      - DISCOURSE_SMTP_ENABLE_START_TLS=false
    expose:
      - "80"
    volumes:
      - discourse-shared:/shared
volumes:
  discourse-shared:
    name: ${VOLUME}
YAMLEOF

# The image: the launcher's bootstrap (the code at DISCOURSE_VERSION, its gems
# and packages, the database migrated, the assets compiled). The longest part of
# the build, and the one that needs the most memory.
echo "Bootstrapping the forum's image (${DISCOURSE_VERSION}) with discourse_docker's launcher."
docker image rm "$IMAGE" > /dev/null 2>&1 || true
(cd discourse_docker && ./launcher bootstrap "$PROJECT_NAME" < /dev/null)

ddev start -y
wait_for_forum

# The settings of a test site, then the administrator with the forum's own task
# (a random password it sets, then the shared one, with the other accounts), and
# the sample content.
site_script settings
FULL_NAME="$(ddev exec -s discourse "rails runner 'print SiteSetting.full_name_requirement'" < /dev/null | tr -d '\r' | tail -n 1)"
if [ "$FULL_NAME" = "required_at_signup" ]; then
  printf 'administrator@example.com\nAdministrator Webship\nY\n' | ddev exec -s discourse "RANDOM_PASSWORD=1 rake admin:create"
else
  printf 'administrator@example.com\nY\n' | ddev exec -s discourse "RANDOM_PASSWORD=1 rake admin:create"
fi
site_script accounts seed

SITE_URL="https://${HOST}"
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$SITE_URL" >> "$GITHUB_ENV"
fi
# The release as the forum's code says it: a channel such as release is a moving tag, and several tags
# point at its commit.
VERSION="$(ddev exec -s discourse "sed -n 's/.*STRING = \"\\(.*\\)\".*/\\1/p' /var/www/discourse/lib/version.rb" < /dev/null | tr -d '\r' | head -n 1)"
echo "Built the forum ${VERSION} at $SITE_URL (mail: https://${HOST}:8026)"
