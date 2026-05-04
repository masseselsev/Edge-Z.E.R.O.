#!/bin/bash
set -e

# Ensure PXE files are in the volume
echo "Syncing PXE boot files..."
cp -rn /tftpboot/* /mnt/infra_config/tftp/

# Prepare UEFI files
mkdir -p /tftpboot/grub
cp /usr/lib/grub/x86_64-efi/monolithic/grubx64.efi /tftpboot/grubx64.efi || \
cp /usr/lib/grub/x86_64-efi/grubnetx64.efi.signed /tftpboot/grubx64.efi || \
grub-mknetdir --net-directory=/tftpboot --subdir=/grub

# Start dnsmasq in background
dnsmasq --conf-file=/etc/dnsmasq.conf --log-dhcp --no-daemon &

# Start nginx in foreground
nginx -g "daemon off;"
