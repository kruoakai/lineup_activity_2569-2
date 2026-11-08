#!/usr/bin/env bash
# สร้าง VM Ubuntu 24.04 (cloud-init) สำหรับระบบเช็กชื่อเข้าแถว — รันบน Proxmox host (Shell ของ node) ด้วย root
#
#   bash proxmox-create-vm.sh \
#     VMID=204 STORAGE=local-lvm BRIDGE=vmbr0 IP=203.113.123.204/24 GW=203.113.123.1 \
#     DNS="8.8.8.8 1.1.1.1" SSHKEY="ssh-ed25519 AAAA... lineup-deploy"
#
# ทุกค่าส่งแบบ KEY=VALUE ได้ ค่าที่ไม่ส่งจะใช้ค่าเริ่มต้นด้านล่าง
set -euo pipefail

VMID=204
NAME=lineup
STORAGE=local-lvm
BRIDGE=vmbr0
IP=203.113.123.204/24
GW=
DNS="8.8.8.8 1.1.1.1"
SEARCHDOMAIN=ccollege.ac.th
CORES=2
MEMORY=4096
DISK=40G
SSHKEY=
CIUSER=lineup
IMG_URL=https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
IMG=/var/lib/vz/template/iso/noble-server-cloudimg-amd64.img

for kv in "$@"; do
  case "${kv%%=*}" in
    VMID|NAME|STORAGE|BRIDGE|IP|GW|DNS|SEARCHDOMAIN|CORES|MEMORY|DISK|SSHKEY|CIUSER) declare "$kv" ;;
    *) echo "ไม่รู้จักพารามิเตอร์: ${kv%%=*}"; exit 1 ;;
  esac
done

[ -n "$GW" ] || { echo "ต้องระบุ GW=<gateway>"; exit 1; }
[ -n "$SSHKEY" ] || { echo "ต้องระบุ SSHKEY=\"ssh-ed25519 ...\""; exit 1; }
if qm status "$VMID" >/dev/null 2>&1; then echo "VMID $VMID มีอยู่แล้ว — เลือกหมายเลขอื่น"; exit 1; fi

if [ ! -f "$IMG" ]; then
  echo "ดาวน์โหลด Ubuntu 24.04 cloud image"
  mkdir -p "$(dirname "$IMG")"
  wget -q --show-progress -O "$IMG.part" "$IMG_URL" && mv "$IMG.part" "$IMG"
fi

KEYFILE=$(mktemp)
echo "$SSHKEY" > "$KEYFILE"

qm create "$VMID" --name "$NAME" --description "ระบบเช็กชื่อเข้าแถว https://lineup.ccollege.ac.th" \
  --ostype l26 --machine q35 --cpu host --cores "$CORES" --memory "$MEMORY" \
  --net0 "virtio,bridge=$BRIDGE" --scsihw virtio-scsi-single --agent enabled=1 \
  --serial0 socket --vga serial0 --onboot 1
qm set "$VMID" --scsi0 "$STORAGE:0,import-from=$IMG,discard=on,ssd=1"
qm resize "$VMID" scsi0 "$DISK"
qm set "$VMID" --ide2 "$STORAGE:cloudinit" --boot order=scsi0
qm set "$VMID" --ciuser "$CIUSER" --sshkeys "$KEYFILE" --ipconfig0 "ip=$IP,gw=$GW" \
  --nameserver "$DNS" --searchdomain "$SEARCHDOMAIN" --ciupgrade 1
rm -f "$KEYFILE"
qm start "$VMID"
echo "สร้างและเปิด VM $VMID ($NAME) แล้ว — IP ${IP%/*} เข้าด้วย: ssh $CIUSER@${IP%/*}"
