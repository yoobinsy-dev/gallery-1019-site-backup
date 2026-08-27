#!/usr/bin/env bash
set -euo pipefail

SCOPE="1019-gallery"
MAIN_ALIAS="gallery-1019-site.vercel.app"

output=$(npx vercel --prod --yes --scope "$SCOPE" 2>&1)
printf '%s\n' "$output"

url=$(printf '%s\n' "$output" | grep -Eo 'https://[A-Za-z0-9-]+\.vercel\.app' | tail -n 1)
if [[ -z "$url" ]]; then
  echo "ERROR: Could not parse deployment URL from vercel output." >&2
  exit 1
fi

host=${url#https://}

echo "Assigning MAIN alias $MAIN_ALIAS -> $host"
npx vercel alias set "$host" "$MAIN_ALIAS" --scope "$SCOPE"

echo "Current MAIN/NINE mapping:"
npx vercel alias ls | grep -E 'gallery-1019-site.vercel.app|gallery-1019-site-nine.vercel.app|gallery-1019-site-'
