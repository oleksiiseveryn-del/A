#!/usr/bin/env bash
# OS – Messenger-Server für HSD Hamburg GmbH
#
# Installiert mit einem Befehl auf einem frischen Ubuntu-24.04- oder Debian-12-Server:
#   Matrix-Homeserver (Synapse + PostgreSQL), HTTPS-Zertifikate (Let's Encrypt),
#   Bridges für WhatsApp, Signal, Instagram und Facebook Messenger
#   sowie einen eigenen Jitsi-Videoserver für die Videoanrufe in OS.
#
# Grundlage ist das gepflegte Projekt matrix-docker-ansible-deploy; dieses Skript
# erzeugt dafür die Konfiguration und führt es lokal auf dem Server aus.
#
# Aufruf (als root):
#   curl -fsSL https://raw.githubusercontent.com/oleksiiseveryn-del/A/claude/unified-messenger-iphone-app-67g1uc/server/install.sh -o install.sh
#   bash install.sh
#
# Erneut ausführbar: vorhandene Passwörter/Schlüssel bleiben erhalten (Update = nochmal ausführen).

set -euo pipefail

PLAYBOOK_DIR=/opt/os-matrix/playbook
STATE_DIR=/opt/os-matrix
VENV=/opt/os-matrix/ansible
PLAYBOOK_REPO=https://github.com/spantaleev/matrix-docker-ansible-deploy.git

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;31m▶ %s\033[0m\n' "$*"; }
die() { red "Fehler: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bitte als root ausführen (z. B. 'sudo -i', dann erneut)."
# shellcheck disable=SC1091
[ -r /etc/os-release ] && . /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ;;
  *) die "Unterstützt werden Ubuntu 24.04 und Debian 12 (gefunden: ${PRETTY_NAME:-unbekannt})." ;;
esac

# ---------------------------------------------------------------------------
# Angaben
# ---------------------------------------------------------------------------

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
CONFIG="$STATE_DIR/os-server.env"
# shellcheck disable=SC1090
[ -f "$CONFIG" ] && . "$CONFIG"

bold "OS – Messenger-Server für HSD Hamburg GmbH"
echo "Es werden drei Angaben benötigt. Vorschläge in [Klammern] mit Enter übernehmen."
echo

if [ -z "${DOMAIN:-}" ]; then
  read -rp "Ihre Domain (ohne www, z. B. hsd-hamburg.de): " DOMAIN
fi
DOMAIN=$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##; s#^www\.##')
[[ "$DOMAIN" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || die "Ungültige Domain: $DOMAIN"

if [ -z "${ADMIN_USER:-}" ]; then
  read -rp "Benutzername für Sie [oleksii]: " ADMIN_USER
  ADMIN_USER=${ADMIN_USER:-oleksii}
fi
ADMIN_USER=$(printf '%s' "$ADMIN_USER" | tr '[:upper:]' '[:lower:]')
[[ "$ADMIN_USER" =~ ^[a-z0-9._=-]+$ ]] || die "Benutzername darf nur a–z, 0–9 und . _ = - enthalten."

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  while true; do
    read -rsp "Passwort für $ADMIN_USER (mind. 12 Zeichen): " ADMIN_PASSWORD; echo
    [ "${#ADMIN_PASSWORD}" -ge 12 ] || { red "Zu kurz."; continue; }
    read -rsp "Passwort wiederholen: " CHECK; echo
    [ "$ADMIN_PASSWORD" = "$CHECK" ] && break
    red "Passwörter stimmen nicht überein."
  done
fi

MATRIX_HOST="matrix.$DOMAIN"
JITSI_HOST="jitsi.$DOMAIN"

# Secrets are generated once and kept, so re-running the script is an update, not a reset.
GENERIC_SECRET=${GENERIC_SECRET:-$(openssl rand -hex 32)}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}
umask 077
cat > "$CONFIG" <<CONF
DOMAIN='$DOMAIN'
ADMIN_USER='$ADMIN_USER'
GENERIC_SECRET='$GENERIC_SECRET'
POSTGRES_PASSWORD='$POSTGRES_PASSWORD'
CONF
umask 022

# ---------------------------------------------------------------------------
# DNS-Prüfung
# ---------------------------------------------------------------------------

step "Prüfe DNS-Einträge"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl dnsutils git openssl python3 python3-venv ca-certificates >/dev/null
PUBLIC_IP=$(curl -fsS4 https://api.ipify.org || true)
[ -n "$PUBLIC_IP" ] || die "Öffentliche IP-Adresse nicht ermittelbar – hat der Server Internet?"
dns_ok=true
for host in "$MATRIX_HOST" "$JITSI_HOST"; do
  resolved=$(dig +short "$host" A | tail -n1)
  if [ "$resolved" = "$PUBLIC_IP" ]; then
    green "  ✓ $host → $PUBLIC_IP"
  else
    red "  ✗ $host zeigt auf '${resolved:-nichts}', erwartet: $PUBLIC_IP"
    dns_ok=false
  fi
done
if [ "$dns_ok" != true ]; then
  echo
  bold "Bitte beim Domain-Anbieter diese beiden DNS-Einträge anlegen:"
  echo "  Typ A   Name: matrix   Wert: $PUBLIC_IP"
  echo "  Typ A   Name: jitsi    Wert: $PUBLIC_IP"
  echo "Nach 5–30 Minuten dieses Skript erneut starten: bash install.sh"
  exit 2
fi

# ---------------------------------------------------------------------------
# Ansible + Playbook
# ---------------------------------------------------------------------------

step "Installiere Werkzeuge (Ansible)"
[ -x "$VENV/bin/ansible-playbook" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q "ansible>=10" passlib
export PATH="$VENV/bin:$PATH"

step "Lade das Matrix-Playbook"
if [ -d "$PLAYBOOK_DIR/.git" ]; then
  git -C "$PLAYBOOK_DIR" pull -q
else
  git clone -q --depth 1 "$PLAYBOOK_REPO" "$PLAYBOOK_DIR"
fi
cd "$PLAYBOOK_DIR"
rm -rf roles/galaxy
ansible-galaxy install -r requirements.yml -p roles/galaxy/ --force >/dev/null

step "Schreibe Konfiguration für $DOMAIN"
VALIDATED=$(grep -E '^matrix_playbook_migration_validated_version:' examples/vars.yml | head -n1)
[ -n "$VALIDATED" ] || die "Playbook-Version nicht erkannt (examples/vars.yml)."
mkdir -p "inventory/host_vars/$MATRIX_HOST"
cat > inventory/hosts <<HOSTS
[matrix_servers]
$MATRIX_HOST ansible_connection=local ansible_python_interpreter=/usr/bin/python3
HOSTS
umask 077
cat > "inventory/host_vars/$MATRIX_HOST/vars.yml" <<VARS
---
# Erzeugt von OS install.sh – Änderungen hier werden beim nächsten Lauf überschrieben.
$VALIDATED

matrix_domain: $DOMAIN
matrix_homeserver_implementation: synapse
matrix_homeserver_generic_secret_key: '$GENERIC_SECRET'
matrix_playbook_reverse_proxy_type: playbook-managed-traefik
devture_systemd_docker_base_ipv6_enabled: true
postgres_connection_password: '$POSTGRES_PASSWORD'

# OS ist der Client – das Element-Webinterface wird nicht benötigt (spart einen DNS-Eintrag).
matrix_client_element_enabled: false

# Bridges: jeder Messenger erscheint als Chat in OS.
matrix_bridge_mautrix_whatsapp_enabled: true
matrix_bridge_mautrix_signal_enabled: true
matrix_bridge_mautrix_meta_instagram_enabled: true
matrix_bridge_mautrix_meta_messenger_enabled: true

# Eigener Videoserver für die Videoanrufe in OS (jitsi.$DOMAIN).
jitsi_enabled: true
VARS
umask 022

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------

step "Installiere Matrix-Server, Bridges und Videoserver (dauert 10–20 Minuten)"
ansible-playbook -i inventory/hosts setup.yml --tags=install-all,ensure-matrix-users-created,start

step "Lege Ihr Konto an"
ansible-playbook -i inventory/hosts setup.yml \
  --extra-vars="$(python3 -c 'import json,sys; print(json.dumps({"username": sys.argv[1], "password": sys.argv[2], "admin": "yes"}))' "$ADMIN_USER" "$ADMIN_PASSWORD")" \
  --tags=register-user >/dev/null || red "Konto existiert bereits oder konnte nicht angelegt werden (bei erneutem Lauf normal)."

step "Prüfe Erreichbarkeit"
if curl -fsS "https://$MATRIX_HOST/_matrix/client/versions" >/dev/null; then
  green "  ✓ Matrix-Server antwortet unter https://$MATRIX_HOST"
else
  red "  ✗ https://$MATRIX_HOST antwortet (noch) nicht – Zertifikat kann einige Minuten dauern."
fi

cat <<DONE

$(bold "Fertig! Das tragen Sie in OS ein:")

  OS → Konten → Matrix / Bridges
     Homeserver:   $MATRIX_HOST
     Benutzername: $ADMIN_USER
     Passwort:     (Ihr gewähltes Passwort)

  OS → Einstellungen → Videoanrufe → Server: Eigener Server
     Adresse:      $JITSI_HOST

$(bold "Messenger koppeln (einmalig):")
  OS → Konten → Ihr Matrix-Konto → "Messenger koppeln" → WhatsApp / Signal / Instagram / Messenger.
  WhatsApp: Kopplung per Code – in WhatsApp "Verknüpfte Geräte → Mit Telefonnummer verknüpfen".
  Signal: QR-Code (OS dafür kurz auf einem zweiten Gerät öffnen und mit Signal scannen).

Zugangsdaten und Schlüssel liegen in $CONFIG – bitte sicher aufbewahren.
Update später: dieses Skript erneut ausführen.
DONE
