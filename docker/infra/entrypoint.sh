#!/bin/bash
set -e

# Ensure PXE files are in the volume
echo "Syncing PXE boot files..."
cp -rn /tftpboot/* /mnt/infra_config/tftp/

# Prepare UEFI files
mkdir -p /tftpboot/boot/grub
grub-mknetdir --net-directory=/tftpboot --subdir=/boot/grub

# Copy the core loader to root for convenience
cp /tftpboot/boot/grub/x86_64-efi/core.efi /tftpboot/grubx64.efi

# Start dnsmasq in background
dnsmasq --conf-file=/etc/dnsmasq.conf --log-dhcp --no-daemon &

# Start nginx in foreground
nginx -g "daemon off;"
