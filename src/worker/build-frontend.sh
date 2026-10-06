#!/bin/sh
set -eu

origem=../frontend
destino=.wrangler/frontend

mkdir -p "$destino"
find "$destino" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
tar -C "$origem" --exclude=./node_modules --exclude=./dist --exclude=./coverage -cf - . | tar -xf - -C "$destino"
pnpm --dir "$destino" install --frozen-lockfile
pnpm --dir "$destino" build
