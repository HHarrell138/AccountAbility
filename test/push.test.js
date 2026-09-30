'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const push = require('../src/push');

test('encrypt matches the worked example in RFC 8291 (Appendix A)', () => {
  const body = push.encrypt(
    'When I grow up, I want to be a watermelon',
    { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    { salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'), serverKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' }
  );
  assert.equal(
    body.toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
  );
});

test('VAPID: a signed token the push service can verify with our public key', () => {
  const { jwk, publicKey } = push.newVapidKeys();
  const auth = push.vapidAuth('https://web.push.apple.com/QGuQyavXutnMH1', jwk, 'mailto:admin@example.com', Date.UTC(2026, 8, 30));
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(auth);
  assert.equal(k, publicKey);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'mailto:admin@example.com');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  assert.equal(Buffer.from(publicKey, 'base64url').length, 65);
});

test('sendPush posts an encrypted, signed message a phone can open', async (t) => {
  const http = require('node:http');
  // The phone's side: its key pair and auth secret.
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  let got;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      got = { headers: req.headers, body: Buffer.concat(chunks) };
      res.writeHead(201).end();
    });
  });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const { jwk } = push.newVapidKeys();
  const sub = { endpoint: `http://127.0.0.1:${server.address().port}/push/abc`, p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  assert.equal(await push.sendPush(sub, { title: 'King nudged you', body: 'Work out' }, { jwk, subject: 'mailto:a@b.co' }), 201);
  assert.equal(got.headers['content-encoding'], 'aes128gcm');
  assert.equal(got.headers.ttl, '86400');
  assert.match(got.headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);

  // Decrypt it as the phone would (RFC 8291, section 3.4 / 4).
  const b = got.body;
  const salt = b.subarray(0, 16);
  const idlen = b[20];
  const asPublic = b.subarray(21, 21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const hk = (ikm, s, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, n));
  const ikm = hk(shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32);
  const cek = hk(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hk(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const ct = b.subarray(21 + idlen);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2); // last-record delimiter
  assert.deepEqual(JSON.parse(plain.subarray(0, -1)), { title: 'King nudged you', body: 'Work out' });
});
