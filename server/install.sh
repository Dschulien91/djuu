#!/bin/sh
# Installs or updates the Djuu API (PocketBase) on a Linux server, next to other apps.
# It only listens on 127.0.0.1:8090; the existing web server (nginx or Caddy) forwards a subdomain to it.
# Usage (as root, from this folder):  sh install.sh api.example.de
set -eu
DOMAIN="${1:?Subdomain angeben, z. B. api.djuu.de}"
VERSION="0.40.6"
DIR=/opt/djuu-api
ORIGINS="https://dschulien91.github.io,https://${DOMAIN}"

id djuu >/dev/null 2>&1 || useradd --system --home "$DIR" --shell /usr/sbin/nologin djuu
mkdir -p "$DIR"
cd /tmp
ZIP="pocketbase_${VERSION}_linux_amd64.zip"
curl -fsSLO "https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/${ZIP}"
curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/checksums.txt" | grep " ${ZIP}\$" | sha256sum -c -
unzip -o -q "$ZIP" pocketbase -d "$DIR"
cd - >/dev/null
rm -rf "$DIR/pb_migrations" "$DIR/pb_hooks"
cp -r pb_migrations pb_hooks "$DIR/"
chown -R djuu:djuu "$DIR"

cat > /etc/systemd/system/djuu-api.service <<EOF
[Unit]
Description=Djuu API (PocketBase)
After=network.target

[Service]
User=djuu
Group=djuu
WorkingDirectory=$DIR
ExecStart=$DIR/pocketbase serve --http=127.0.0.1:8090 --origins=$ORIGINS
Restart=on-failure
LimitNOFILE=4096
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now djuu-api
systemctl restart djuu-api
sleep 2
curl -fsS http://127.0.0.1:8090/api/health && echo

cat <<EOF

Djuu API läuft auf 127.0.0.1:8090. Jetzt den Webserver weiterleiten lassen:

nginx (Zertifikat danach mit: certbot --nginx -d ${DOMAIN}):
  server {
    server_name ${DOMAIN};
    client_max_body_size 5m;
    location / {
      proxy_pass http://127.0.0.1:8090;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_http_version 1.1;
      proxy_set_header Connection '';
      proxy_buffering off;   # live updates
      proxy_read_timeout 360s;
    }
  }

Caddy:
  ${DOMAIN} {
    reverse_proxy 127.0.0.1:8090
  }

Danach einmalig das Admin-Konto anlegen:
  sudo -u djuu $DIR/pocketbase superuser upsert ADMIN-EMAIL PASSWORT --dir $DIR/pb_data
und unter https://${DOMAIN}/_/ → Settings → Mail server die Mail-Zugangsdaten für die Login-Codes eintragen.
Backup: $DIR/pb_data regelmäßig sichern (enthält die Datenbank).
EOF
