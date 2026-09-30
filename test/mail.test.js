'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { sendMail, config } = require('../src/mail');

// A fake SMTP server that records the conversation.
function fakeSmtp() {
  const seen = [];
  const server = net.createServer((sock) => {
    sock.setEncoding('utf8');
    sock.write('220 fake ESMTP\r\n');
    let data = false;
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') {
            data = false;
            sock.write('250 queued\r\n');
          } else seen.push(`DATA|${line}`);
          continue;
        }
        seen.push(line);
        if (line.startsWith('EHLO')) sock.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (line.startsWith('AUTH PLAIN')) sock.write(Buffer.from(line.slice(11), 'base64').toString() === '\0me@gmail.com\0secret' ? '235 ok\r\n' : '535 bad\r\n');
        else if (line.startsWith('MAIL') || line.startsWith('RCPT')) sock.write('250 ok\r\n');
        else if (line === 'DATA') {
          data = true;
          sock.write('354 go\r\n');
        } else if (line === 'QUIT') sock.end('221 bye\r\n');
      }
    });
  });
  return { server, seen };
}

test('sendMail speaks SMTP: login, envelope, headers, dot-stuffing', async (t) => {
  const { server, seen } = fakeSmtp();
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const cfg = config({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.address().port), SMTP_SECURE: 'false', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'secret' });
  await sendMail({ to: 'jake@example.com', subject: 'Your code\r\nBcc: evil@x.com', text: 'Hi\n.hidden line\nBye' }, cfg);
  assert.ok(seen.includes('MAIL FROM:<me@gmail.com>'));
  assert.ok(seen.includes('RCPT TO:<jake@example.com>'));
  assert.ok(seen.includes('DATA|Subject: Your code Bcc: evil@x.com')); // no header injection
  assert.ok(!seen.some((l) => l === 'DATA|Bcc: evil@x.com'));
  assert.ok(seen.includes('DATA|..hidden line'));
  assert.ok(seen.includes('DATA|Bye'));

  // A wrong password is an error, not a silent success.
  await assert.rejects(sendMail({ to: 'a@b.co', subject: 's', text: 't' }, { ...cfg, pass: 'nope' }), /expected 235/);
  assert.equal(config({}), null); // off without credentials
});
