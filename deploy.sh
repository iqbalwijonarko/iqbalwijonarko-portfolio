#!/usr/bin/env bash
#
# Self-healing deploy for GitHub Pages.
#
#   ./deploy.sh "commit message"
#
# GitHub Pages sometimes doesn't publish the latest push on its own. This script
# commits + pushes, then VERIFIES the exact build is live on the domain — and if
# Pages stalls, it automatically re-triggers the build (empty commit) until prod
# actually reflects the change. No more "it's stuck" guesswork.
#
set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-Update site}"
DOMAIN="https://iqbalwijonarko.com"
NAME="Iqbal Wijonarko"
EMAIL="iqbal@bu.edu"

# A unique stamp for THIS deploy. It ships in deploy-id.txt, so we can detect the
# exact moment prod is serving this build (not a stale cache, not an old commit).
STAMP="$(date +%s)-$$-${RANDOM}"
echo "$STAMP" > deploy-id.txt

git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "$MSG"
git push -q origin main
echo "Pushed $(git rev-parse --short HEAD): $MSG"
echo "Verifying it goes live on $DOMAIN ..."

tries=0
MAX=30            # ~10 min ceiling
while [ "$tries" -lt "$MAX" ]; do
  live="$(curl -s --max-time 15 "$DOMAIN/deploy-id.txt?x=$(date +%s)$tries" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$live" = "$STAMP" ]; then
    echo "LIVE  prod is serving this exact build after ~$((tries * 20))s."
    exit 0
  fi
  tries=$((tries + 1))
  # If it hasn't shown up after ~80s, nudge Pages with an empty commit.
  if [ $((tries % 4)) -eq 0 ]; then
    echo "Still not live after ~$((tries * 20))s — re-triggering GitHub Pages build..."
    git -c user.name="$NAME" -c user.email="$EMAIL" commit -q --allow-empty -m "Re-trigger GitHub Pages deploy"
    git push -q origin main
  fi
  sleep 20
done

echo "TIMEOUT: prod still not serving this build after ~10 min. Check GitHub → repo → Actions/Pages."
exit 1
