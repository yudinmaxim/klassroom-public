#!/usr/bin/env bash
# Публикация снапшота релиза в публичный репозиторий klassroom-public.
#
# Приватный репо — грязная история разработки; публичный получает только
# чистые снапшоты: один коммит "release <ver>" на версию, без промежуточной
# истории. Теги переносятся с теми же именами.
#
# Использование:
#   ./scripts/publish.sh v0.1.0     # опубликовать тег
#   ./scripts/publish.sh HEAD      # опубликовать текущий коммит
#
# Требования: git; ssh-доступ к github.com:yudinmaxim/klassroom-public.

set -euo pipefail

REF="${1:?usage: publish.sh <tag|ref>}"
PUBLIC_REPO="${PUBLIC_REPO:-git@github.com:yudinmaxim/klassroom-public.git}"
PUBLIC_BRANCH="${PUBLIC_BRANCH:-main}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

git rev-parse --verify --quiet "$REF^{commit}" >/dev/null \
  || { echo "error: ref '$REF' not found" >&2; exit 1; }
VERSION="$(git describe --tags --exact-match "$REF" 2>/dev/null \
  || git describe --tags "$REF" 2>/dev/null \
  || echo "$REF")"
VERSION="v${VERSION#v}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> export $REF ($VERSION)"
mkdir -p "$WORK/src"
git archive "$REF" | tar -x -C "$WORK/src"

echo "==> clone public repo"
git clone --quiet "$PUBLIC_REPO" "$WORK/public" 2>/dev/null \
  || { mkdir -p "$WORK/public"; git -C "$WORK/public" init -b "$PUBLIC_BRANCH"; git -C "$WORK/public" remote add origin "$PUBLIC_REPO"; }
PUBLIC_DIR="$WORK/public"

echo "==> sync tree"
find "$PUBLIC_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -a "$WORK/src/." "$PUBLIC_DIR/"

cd "$PUBLIC_DIR"
git add -A
if git diff --cached --quiet; then
  echo "==> no changes, already published"
  exit 0
fi
git commit --quiet -m "release $VERSION"
git branch -M "$PUBLIC_BRANCH"
if ! git rev-parse --verify --quiet "refs/tags/$VERSION" >/dev/null; then
  git tag "$VERSION"
fi
echo "==> push $PUBLIC_BRANCH + tag $VERSION"
git push --quiet origin "$PUBLIC_BRANCH"
git push --quiet origin "refs/tags/$VERSION:refs/tags/$VERSION"
echo "==> done: https://github.com/yudinmaxim/klassroom-public/releases/tag/$VERSION"
