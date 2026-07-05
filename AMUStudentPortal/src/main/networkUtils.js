'use strict';

const os = require('os');

/**
 * Auto-detect the client machine's LAN IPv4 address.
 * Used for seat identification — the server maps IP → seat number.
 */
function getClientIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.internal) continue;
      if (iface.family !== 'IPv4') continue;

      // Skip common virtual adapter prefixes
      const lowerName = name.toLowerCase();
      if (lowerName.includes('vmware') || lowerName.includes('virtualbox') || lowerName.includes('docker')) {
        continue;
      }

      return iface.address;
    }
  }

  return '127.0.0.1'; // Fallback
}

/**
 * Get all non-internal IPv4 addresses (for diagnostics).
 */
function getAllIPs() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.internal) continue;
      if (iface.family !== 'IPv4') continue;
      results.push({ name, address: iface.address });
    }
  }

  return results;
}

module.exports = { getClientIP, getAllIPs };
