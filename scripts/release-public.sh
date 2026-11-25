#!/usr/bin/env bash
# Релиз в публичный репозиторий klassroom-public.
#
# public — зеркало приватного origin (main перезаписывается force-push'ем,
# «лишней истории» там нет). GitHub Actions в public собирает Docker-образ
# в ghcr.io/yudinmaxim/klassroom-public; в приватном репо job пропускается
# по guard'у github.repository.
#
# Использование: scripts/release-public.sh X.Y.Z
#   напр. scripts/release-public.sh 0.1.23 → тег v0.1.23 → образы :0.1.23, :0.1, :0
set -euo pipefail

version="${1:?usage: release-public.sh X.Y.Z}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
  || { echo "Версия должна быть semver, например 0.1.23" >&2; exit 1; }
tag="v$version"

cd "$(dirname "$0")/.."

# remote public должен существовать: git remote add public git@github.com:yudinmaxim/klassroom-public.git
git remote get-url public >/dev/null 2>&1 || {
  echo "Remote 'public' не настроен. Добавь: git remote add public git@github.com:yudinmaxim/klassroom-public.git" >&2
  exit 1
}

# локальный тег vX.Y.Z на текущем HEAD (если ещё нет)
git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git tag "$tag"

# зеркало main (force — публичка перезаписываемая копия)
git push public main --force
# сам тег (force — зеркалим локальное состояние тегов)
git push public "$tag" --force

echo "Релиз $tag отправлен в klassroom-public."
echo "Образ появится как ghcr.io/yudinmaxim/klassroom-public:$version (+ :$major.$minor, :$major)"
