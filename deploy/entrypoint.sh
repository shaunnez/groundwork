#!/bin/sh
set -eu
# Railway mounts volumes as root. Only these application-owned directories change owner.
mkdir -p /data/objects /data/claude-home
chown node:node /data/objects /data/claude-home
chmod 700 /data/objects /data/claude-home
exec gosu node "$@"
