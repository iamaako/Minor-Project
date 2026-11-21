'use strict';

const os = require('os');

/**
 * Finds the addresses other computers can really use to reach this PC.
 *
 * os.networkInterfaces() lists EVERY adapter. On a laptop that has VirtualBox, VMware,
 * Hyper-V or WSL installed, a virtual adapter (for example VirtualBox's 192.168.56.1) often
 * comes first. Taking "the first one" showed that address in the app, and nobody
 * could connect to it. Virtual adapters are recognised here by the vendor part of their
 * MAC address and by name, then the rest are ranked.
 */

// Vendor prefixes (first bytes of the MAC) of adapters that are not a real LAN / Wi-Fi card
const VIRTUAL_MAC_PREFIXES = [
  '08:00:27', '0a:00:27',                         // VirtualBox (incl. Host-Only)
  '00:50:56', '00:0c:29', '00:05:69', '00:1c:14', // VMware
  '00:15:5d',                                     // Hyper-V, WSL
  '00:1c:42',                                     // Parallels
  '52:54:00',                                     // QEMU / KVM
  '02:42',                                        // Docker
];
const VIRTUAL_NAME_RE = /vmware|virtualbox|vbox|vmnet|hyper-v|vethernet|wsl|docker|npcap|bluetooth|tailscale|zerotier|hamachi|vpn|loopback|pseudo|\btap\b|\btun\b|utun/i;
const HOTSPOT_NAME_RE = /local area connection\*|wi-?fi direct|hotspot|hosted/i;

// Lower = better. The hotspot is first on purpose: if the teacher turned it on, the
// students are on it. When it is off the adapter has no address and is not listed.
const RANK = { hotspot: 0, ethernet: 1, wifi: 2, other: 3, virtual: 4 };
const LABEL = { hotspot: 'Mobile Hotspot', ethernet: 'Ethernet', wifi: 'Wi-Fi', other: 'Network', virtual: 'Virtual adapter' };

function isVirtual(name, mac) {
  const m = String(mac || '').toLowerCase();
  if (VIRTUAL_MAC_PREFIXES.some((p) => m.startsWith(p))) return true;
  return VIRTUAL_NAME_RE.test(name);
}

function kindOf(name, address, mac) {
  if (isVirtual(name, mac)) return 'virtual';
  if (HOTSPOT_NAME_RE.test(name) || address === '192.168.137.1') return 'hotspot';
  if (/wi-?fi|wlan|wireless|^wl/i.test(name)) return 'wifi';
  if (/ethernet|^en|^eth|lan/i.test(name)) return 'ethernet';
  return 'other';
}

/** All IPv4 addresses of this PC, best first. Each: { name, address, mac, kind, label, virtual } */
function getNetworkCandidates() {
  const list = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const a of interfaces[name]) {
      const isV4 = a.family === 'IPv4' || a.family === 4;
      if (!isV4 || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // "no network" self-assigned address
      const kind = kindOf(name, a.address, a.mac);
      list.push({ name, address: a.address, mac: a.mac, kind, label: LABEL[kind], virtual: kind === 'virtual' });
    }
  }
  list.sort((x, y) => RANK[x.kind] - RANK[y.kind]);
  return list;
}

/** The address to give to students. 127.0.0.1 only when this PC has no network at all. */
function getBestIp() {
  const list = getNetworkCandidates();
  const real = list.find((c) => !c.virtual);
  return (real || list[0] || { address: '127.0.0.1' }).address;
}

module.exports = { getNetworkCandidates, getBestIp };
