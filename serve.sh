#!/bin/sh
cd "$(dirname "$0")"
PORT="${PORT:-8777}"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "YOUR-MAC-IP")"
echo "Leave this running. On your iPhone (same Wi‑Fi), open Safari:"
echo "  http://$IP:$PORT/"
echo "Then tap Share → Add to Home Screen."
exec python3 -m http.server "$PORT" --bind 0.0.0.0
