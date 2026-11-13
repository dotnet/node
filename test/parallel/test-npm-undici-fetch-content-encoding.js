'use strict';
const common = require('../common');
const assert = require('node:assert');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { test } = require('node:test');
const { Client, fetch } = require('../../deps/npm/node_modules/undici');

test('npm fetch rejects excessive content encodings without an unhandled error', async (t) => {
  let resolveSocketClosed;
  const socketClosed = new Promise((resolve) => {
    resolveSocketClosed = resolve;
  });
  const server = createServer(common.mustCall((socket) => {
    socket.once('close', resolveSocketClosed);
    socket.once('data', common.mustCall(() => {
      socket.end(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\r\n' +
        'Content-Length: 1\r\n' +
        'Connection: close\r\n\r\n',
      );
    }));
  }));
  t.after(() => server.close());
  server.listen(0, common.localhostIPv4);
  await once(server, 'listening');

  const url = `http://${common.localhostIPv4}:${server.address().port}`;
  const client = new Client(url);
  t.after(() => client.close());

  await assert.rejects(fetch(url, { dispatcher: client }), (err) => {
    assert.match(err.cause.message, /too many content-encodings/);
    return true;
  });
  await socketClosed;
});

test('npm fetch still accepts an ordinary response', async (t) => {
  const server = createServer(common.mustCall((socket) => {
    socket.once('data', common.mustCall(() => {
      socket.end(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Length: 2\r\n' +
        'Connection: close\r\n\r\nOK',
      );
    }));
  }));
  t.after(() => server.close());
  server.listen(0, common.localhostIPv4);
  await once(server, 'listening');

  const response = await fetch(`http://${common.localhostIPv4}:${server.address().port}`);
  assert.strictEqual(await response.text(), 'OK');
});
