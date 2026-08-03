#!/usr/bin/env bash
# Rasterize every committed SVG figure to PNG.
#
#     ./charts/rasterize.sh [width]
#
# Publishing tools mostly do not accept SVG uploads, so the PNGs are the
# deliverable and the SVGs are the source. Default width is 2400px — roughly 2x
# a wide article column, which stays sharp on a high-DPI screen without being
# absurd to upload.
#
# Inkscape is snap-confined on this machine and resolves relative paths against
# $HOME, so every path handed to it must be absolute. That is not a style
# preference; relative paths silently fail with "cannot be opened".
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
PNG="$OUT/png"
WIDTH="${1:-2400}"

command -v inkscape >/dev/null 2>&1 || {
  echo "inkscape not found — install it, or use rsvg-convert/resvg and adjust this script." >&2
  exit 1
}

mkdir -p "$PNG"
count=0
for svg in "$OUT"/*.svg; do
  [ -e "$svg" ] || continue
  base="$(basename "$svg" .svg)"
  inkscape "$svg" --export-type=png --export-filename="$PNG/$base.png" -w "$WIDTH" 2>/dev/null
  if [ -f "$PNG/$base.png" ]; then
    count=$((count + 1))
    printf '  %-32s %s\n' "$base.png" "$(du -h "$PNG/$base.png" | cut -f1)"
  else
    echo "  FAILED: $base" >&2
  fi
done
echo "rasterized $count figure(s) at ${WIDTH}px into $PNG"
