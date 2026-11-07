#!/bin/sh
# One-time helper: lets Claude's Djuu key log in. Remove the line from ~/.ssh/authorized_keys to revoke.
KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDKgv5SMtTtaSi1zjDcUS1yK9odRCrsNB4r8uY3L0RLX claude-djuu@ElsaJulian'
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"
grep -qF "$KEY" "$HOME/.ssh/authorized_keys" || echo "$KEY" >> "$HOME/.ssh/authorized_keys"
echo "OK - Schluessel ist eingetragen"
