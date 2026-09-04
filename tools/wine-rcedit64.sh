#!/bin/sh
# Behelf für den Bau der Windows-Anwendung auf Linux.
#
# electron-builder ruft zum Setzen von Symbol und Versionsangaben das
# Programm rcedit-ia32.exe unter wine auf. Fehlt der 32-Bit-Teil von wine
# (WoW64), scheitert das mit "failed to load ntdll.dll". Beide Fassungen
# von rcedit nehmen dieselben Aufrufe entgegen, deshalb wird hier die
# 64-Bit-Fassung an die Stelle der 32-Bit-Fassung gelegt.
#
# Auf einem Windows-Rechner und im GitHub-Ablauf (windows-latest) wird
# dieser Behelf nicht gebraucht.
set -eu
CACHE="${ELECTRON_BUILDER_CACHE:-$HOME/.cache/electron-builder}/winCodeSign"
DIR=$(find "$CACHE" -maxdepth 1 -type d -name 'winCodeSign-*' | head -n1)
[ -n "$DIR" ] || { echo "winCodeSign nicht im Zwischenspeicher – zuerst electron-builder laufen lassen." >&2; exit 1; }
[ -f "$DIR/rcedit-ia32.exe.orig" ] || cp "$DIR/rcedit-ia32.exe" "$DIR/rcedit-ia32.exe.orig"
cp "$DIR/rcedit-x64.exe" "$DIR/rcedit-ia32.exe"
echo "rcedit auf 64 Bit umgestellt: $DIR"
