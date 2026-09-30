'use strict';

// Web Push with no dependencies: the payload encryption from RFC 8291
// (aes128gcm) and VAPID sign-in from RFC 8292. Works for iPhone home-screen
// apps (iOS 16.4+), Android and desktop browsers alike.

const crypto = require('node:crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const hkdf = (ikm, salt, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));

// A new server key pair for VAPID, as JWK (private) and the raw public key
// browsers need, base64url.
function newVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { jwk, publicKey: publicKeyOf(jwk) };
}

function publicKeyOf(jwk) {
  return b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
}

// Encrypt a payload for one browser subscription (RFC 8291). `salt` and
// `serverKey` are only passed in by tests, to check against the RFC's example.
function encrypt(payload, { p256dh, auth }, { salt = crypto.randomBytes(16), serverKey } = {}) {
  const uaPublic = Buffer.from(p256dh, 'base64url');
  const authSecret = Buffer.from(auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  if (serverKey) ecdh.setPrivateKey(Buffer.from(serverKey, 'base64url'));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(shared, authSecret, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // One record: the payload, then the 0x02 "last record" delimiter.
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// The VAPID Authorization header for one push service (RFC 8292).
function vapidAuth(endpoint, jwk, subject, now = Date.now()) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${publicKeyOf(jwk)}`;
}

// Send one notification. Resolves with the push service's HTTP status:
// 201 is delivered; 404 or 410 means the subscription is gone for good.
async function sendPush(sub, message, { jwk, subject }) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Urgency: 'normal',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: vapidAuth(sub.endpoint, jwk, subject),
    },
    body: encrypt(JSON.stringify(message), sub),
  });
  return res.status;
}

module.exports = { newVapidKeys, publicKeyOf, encrypt, vapidAuth, sendPush };
