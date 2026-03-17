// subnet.ts
import os from 'os';
import type { Request, Response, NextFunction } from 'express';

function getServerSubnets(): string[] {
  const ifaces = os.networkInterfaces();
  const subnets: string[] = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Simple /24 subnet match — extract first 3 octets
        const parts = iface.address.split('.');
        subnets.push(parts.slice(0, 3).join('.'));
      }
    }
  }
  return subnets;
}

export function subnetMiddleware(enabled: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled) { next(); return; }

    const clientIp = req.ip || req.socket.remoteAddress || '';
    // Normalize IPv6-mapped IPv4
    const ip = clientIp.replace(/^::ffff:/, '');

    if (ip === '127.0.0.1' || ip === '::1') { next(); return; }

    const clientPrefix = ip.split('.').slice(0, 3).join('.');
    const serverSubnets = getServerSubnets();

    if (serverSubnets.includes(clientPrefix)) {
      next();
    } else {
      res.status(403).json({ error: 'Connection restricted to same subnet' });
    }
  };
}
