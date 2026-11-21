'use strict';

const os = require('os');
const dgram = require('dgram');

// Vendor prefixes (first bytes of the MAC address) of adapters that are not a real LAN / Wi-Fi card.
// VirtualBox's Host-Only adapter (192.168.56.1) is the usual cause of a wrong address.
const VIRTUAL_MAC_PREFIXES = [
  '08:00:27', '0a:00:27',                         // VirtualBox
  '00:50:56', '00:0c:29', '00:05:69', '00:1c:14', // VMware
  '00:15:5d',                                     // Hyper-V, WSL
  '00:1c:42',                                     // Parallels
  '52:54:00',                                     // QEMU / KVM
  '02:42',                                        // Docker
];
const VIRTUAL_NAME_RE = /vmware|virtualbox|vbox|vmnet|hyper-v|vethernet|wsl|docker|npcap|bluetooth|tailscale|zerotier|hamachi|vpn|loopback|pseudo|\btap\b|\btun\b|utun/i;

function isVirtual(name, mac) {
  const m = String(mac || '').toLowerCase();
  return VIRTUAL_MAC_PREFIXES.some((p) => m.startsWith(p)) || VIRTUAL_NAME_RE.test(name);
}

function _ipv4List() {
  const out = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      const isV4 = iface.family === 'IPv4' || iface.family === 4;
      if (!isV4 || iface.internal) continue;
      if (iface.address.startsWith('169.254.')) continue; // "no network" self-assigned address
      out.push({ name, address: iface.address, virtual: isVirtual(name, iface.mac) });
    }
  }
  return out;
}

/**
 * Best guess of this PC's LAN IPv4 address (used only until the server address is known,
 * see getLocalIPToward). Real adapters win over virtual ones.
 */
function getClientIP() {
  const list = _ipv4List();
  const real = list.find((i) => !i.virtual);
  return (real || list[0] || { address: '127.0.0.1' }).address;
}

/**
 * The local address Windows/Linux would use to reach `host`: that is the adapter that is
 * really on the same network as the exam server. Nothing is sent: a UDP socket is only
 * "connected" so the operating system picks the route.
 * Resolves to null when there is no route.
 */
function getLocalIPToward(host, port) {
  return new Promise((resolve) => {
    let sock;
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { if (sock) sock.close(); } catch (e) { /* already closed */ }
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 2000);
    try {
      sock = dgram.createSocket('udp4');
      sock.on('error', () => done(null));
      sock.connect(Number(port) || 3000, host, () => {
        try {
          const a = sock.address().address;
          done(a && a !== '0.0.0.0' && !a.startsWith('127.') ? a : null);
        } catch (e) {
          done(null);
        }
      });
    } catch (e) {
      done(null);
    }
  });
}

/**
 * Get all non-internal IPv4 addresses (for diagnostics).
 */
function getAllIPs() {
  return _ipv4List().map(({ name, address, virtual }) => ({ name, address, virtual }));
}

module.exports = { getClientIP, getLocalIPToward, getAllIPs };
