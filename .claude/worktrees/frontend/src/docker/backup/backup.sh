#!/bin/sh
set -eu

while true; do
  carimbo="$(date +%F-%H%M)"
  pg_dump -Fc > "/backups/pg-${carimbo}.dump"
  tar czf "/backups/media-${carimbo}.tgz" -C /data media
  find /backups -type f -mtime "+${BACKUP_RETENCAO_DIAS}" -delete
  echo "backup ${carimbo} ok: $(find /backups -type f | wc -l) arquivo(s) retido(s)"
  sleep 86400
done
