#!/bin/bash
set -e

# Ensure PXE files are in the volume
echo "Syncing PXE boot files..."
cp -rn /tftpboot/* /mnt/infra_config/tftp/

# Prepare UEFI files
mkdir -p /tftpboot/boot/grub
mkdir -p /tftpboot/grub

# Use the official signed loader - it is the most compatible
cp /usr/lib/grub/x86_64-efi-signed/grubnetx64.efi.signed /tftpboot/grubx64.efi

if [ ! -f /mnt/infra_config/dnsmasq.conf ]; then
  cp /etc/dnsmasq.conf /mnt/infra_config/dnsmasq.conf
fi

# Background daemon watchdog to hot-reload dnsmasq on configuration changes
(
  LAST_MD5=""
  while true; do
    if [ -f /mnt/infra_config/dnsmasq.conf ]; then
      CURRENT_MD5=$(md5sum /mnt/infra_config/dnsmasq.conf | cut -d' ' -f1)
      if [ "$CURRENT_MD5" != "$LAST_MD5" ]; then
        if [ -n "$LAST_MD5" ]; then
          echo "[Infra] dnsmasq.conf changed, restarting dnsmasq..."
          pkill -f dnsmasq || kill $(pidof dnsmasq) || true
          sleep 1
          dnsmasq --conf-file=/mnt/infra_config/dnsmasq.conf --log-dhcp --no-daemon &
        fi
        LAST_MD5=$CURRENT_MD5
      fi
    fi
    sleep 3
  done
) &

# Start dnsmasq in background
dnsmasq --conf-file=/mnt/infra_config/dnsmasq.conf --log-dhcp --no-daemon &

# Start nginx in foreground
nginx -g "daemon off;"
