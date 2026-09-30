'use strict';

// Sends plain-text email over SMTP, with no dependencies. Set up for Gmail:
// SMTP_USER is the Gmail address and SMTP_PASS a Google "app password"
// (Google Account -> Security -> 2-Step Verification -> App passwords).
// Any other SMTP server works with SMTP_HOST / SMTP_PORT.
//
//   SMTP_HOST    default smtp.gmail.com
//   SMTP_PORT    default 465 (TLS from the start)
//   SMTP_SECURE  default true; "false" for a plain connection (tests)
//   SMTP_USER, SMTP_PASS   required; without them email is off
//   SMTP_FROM    default SMTP_USER

const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const crypto = require('node:crypto');

function config(env = process.env) {
  if (!env.SMTP_USER || !env.SMTP_PASS) return null;
  return {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT || 465),
    secure: env.SMTP_SECURE !== 'false',
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || env.SMTP_USER,
  };
}

// One SMTP conversation: each command waits for its reply code.
function sendMail({ to, subject, text }, cfg = config()) {
  if (!cfg) return Promise.reject(new Error('Email is not set up'));
  return new Promise((resolve, reject) => {
    const socket = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
      : net.connect({ host: cfg.host, port: cfg.port });
    socket.setEncoding('utf8');
    socket.setTimeout(20000, () => socket.destroy(new Error('SMTP timed out')));

    let buffer = '';
    let waiting = null; // { code, resolve }
    socket.on('data', (chunk) => {
      buffer += chunk;
      // A reply is done at a line like "250 ok" (not "250-more").
      const lines = buffer.split('\r\n');
      const last = lines.findIndex((l) => /^\d{3} /.test(l));
      if (last === -1 || !waiting) return;
      const reply = lines.slice(0, last + 1).join('\n');
      buffer = lines.slice(last + 1).join('\r\n');
      const w = waiting;
      waiting = null;
      if (reply.slice(0, 3) === String(w.code)) w.resolve(reply);
      else socket.destroy(new Error(`SMTP: expected ${w.code}, got ${reply.split('\n').pop()}`));
    });
    socket.on('error', reject);
    socket.on('close', () => reject(new Error('SMTP connection closed')));

    const expect = (code) => new Promise((res) => (waiting = { code, resolve: res }));
    const cmd = (line, code) => {
      const p = expect(code);
      socket.write(`${line}\r\n`);
      return p;
    };

    const headerSafe = (s) => String(s).replace(/[\r\n]+/g, ' ');
    const message = [
      `From: "AccountAbility" <${headerSafe(cfg.from)}>`,
      `To: <${headerSafe(to)}>`,
      `Subject: ${headerSafe(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${headerSafe(cfg.from.split('@')[1] || 'accountability')}>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      // Dot-stuffing: a line starting with "." gets another one.
      ...String(text).split(/\r?\n/).map((l) => (l.startsWith('.') ? `.${l}` : l)),
    ].join('\r\n');

    (async () => {
      await expect(220);
      await cmd(`EHLO ${os.hostname() || 'accountability'}`, 250);
      await cmd(`AUTH PLAIN ${Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString('base64')}`, 235);
      await cmd(`MAIL FROM:<${headerSafe(cfg.from)}>`, 250);
      await cmd(`RCPT TO:<${headerSafe(to)}>`, 250);
      await cmd('DATA', 354);
      await cmd(`${message}\r\n.`, 250);
      socket.removeAllListeners('close');
      socket.end('QUIT\r\n');
      resolve();
    })().catch((err) => {
      socket.destroy();
      reject(err);
    });
  });
}

module.exports = { config, sendMail };
