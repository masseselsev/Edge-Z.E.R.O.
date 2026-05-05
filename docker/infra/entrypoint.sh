#!/bin/bash
set -e

# Ensure PXE files are in the volume
echo "Syncing PXE boot files..."
cp -rn /tftpboot/* /mnt/infra_config/tftp/

# Prepare UEFI files
mkdir -p /tftpboot/boot/grub
mkdir -p /tftpboot/grub

# Use the official signed loader - it is the most compatible
cp /usr/lib/grub/x86_64-efi/grubnetx64.efi.signed /tftpboot/grubx64.efi

# Start dnsmasq in background
dnsmasq --conf-file=/etc/dnsmasq.conf --log-dhcp --no-daemon &

# Start nginx in foreground
nginx -g "daemon off;"
