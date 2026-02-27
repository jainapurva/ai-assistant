const crypto = require('crypto');
const http = require('http');

// We test the provider in isolation — mock nothing in the provider itself,
// but we need to test webhook handling, signature verification, and message normalization.

// Helper: create a provider instance with test config
function createTestProvider() {
  const CloudAPIProvider = require('../../src/providers/cloud-api-provider');
  return new CloudAPIProvider({
    metaAccessToken: 'test-token',
    metaAppSecret: 'test-secret',
    metaPhoneNumberId: '123456789',
    metaWebhookVerifyToken: 'my-verify-token',
    webhookPort: 0, // Let OS pick a free port
  });
}

// Helper: build a valid webhook signature
function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Helper: make HTTP request to the provider's webhook server
function request(port, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('CloudAPIProvider', () => {
  let provider;
  let serverPort;

  beforeAll(async () => {
    provider = createTestProvider();
    await provider.initialize();
    serverPort = provider.server.address().port;
  });

  afterAll(async () => {
    await provider.destroy();
  });

  describe('webhook verification (GET /webhook)', () => {
    test('returns challenge on valid verify token', async () => {
      const res = await request(
        serverPort, 'GET',
        '/webhook?hub.mode=subscribe&hub.verify_token=my-verify-token&hub.challenge=test-challenge-123'
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe('test-challenge-123');
    });

    test('returns 403 on invalid verify token', async () => {
      const res = await request(
        serverPort, 'GET',
        '/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test'
      );
      expect(res.status).toBe(403);
    });

    test('returns 403 when mode is not subscribe', async () => {
      const res = await request(
        serverPort, 'GET',
        '/webhook?hub.mode=unsubscribe&hub.verify_token=my-verify-token&hub.challenge=test'
      );
      expect(res.status).toBe(403);
    });
  });

  describe('webhook signature validation', () => {
    test('rejects POST with missing signature', async () => {
      const body = JSON.stringify({ entry: [] });
      const res = await request(serverPort, 'POST', '/webhook', body, {
        'Content-Type': 'application/json',
      });
      expect(res.status).toBe(403);
    });

    test('rejects POST with invalid signature', async () => {
      const body = JSON.stringify({ entry: [] });
      const res = await request(serverPort, 'POST', '/webhook', body, {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=invalid',
      });
      expect(res.status).toBe(403);
    });

    test('accepts POST with valid signature', async () => {
      const body = JSON.stringify({ entry: [] });
      const signature = sign(body, 'test-secret');
      const res = await request(serverPort, 'POST', '/webhook', body, {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      });
      expect(res.status).toBe(200);
    });
  });

  describe('message normalization', () => {
    test('emits normalized message for text message', (done) => {
      const payload = {
        entry: [{
          changes: [{
            field: 'messages',
            value: {
              metadata: { phone_number_id: '123456789' },
              contacts: [{ wa_id: '14155551234', profile: { name: 'Test User' } }],
              messages: [{
                id: 'wamid.test123',
                from: '14155551234',
                type: 'text',
                text: { body: 'Hello Claude!' },
                timestamp: '1234567890',
              }],
            },
          }],
        }],
      };

      provider.once('message', (msg) => {
        expect(msg.id).toBe('wamid.test123');
        expect(msg.chatId).toBe('14155551234@c.us');
        expect(msg.senderId).toBe('14155551234@c.us');
        expect(msg.type).toBe('chat');
        expect(msg.body).toBe('Hello Claude!');
        expect(msg.fromMe).toBe(false);
        expect(msg.isGroup).toBe(false);
        expect(msg.hasMedia).toBe(false);
        expect(msg.pushName).toBe('Test User');
        done();
      });

      const body = JSON.stringify(payload);
      const signature = sign(body, 'test-secret');
      request(serverPort, 'POST', '/webhook', body, {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      });
    });

    test('emits normalized message for image with caption', (done) => {
      const payload = {
        entry: [{
          changes: [{
            field: 'messages',
            value: {
              metadata: {},
              contacts: [{ wa_id: '14155559999', profile: { name: 'Photo User' } }],
              messages: [{
                id: 'wamid.img456',
                from: '14155559999',
                type: 'image',
                image: { id: 'media123', caption: 'Look at this!' },
                timestamp: '1234567891',
              }],
            },
          }],
        }],
      };

      provider.once('message', (msg) => {
        expect(msg.id).toBe('wamid.img456');
        expect(msg.type).toBe('image');
        expect(msg.body).toBe('Look at this!');
        expect(msg.hasMedia).toBe(true);
        expect(msg.pushName).toBe('Photo User');
        done();
      });

      const body = JSON.stringify(payload);
      const signature = sign(body, 'test-secret');
      request(serverPort, 'POST', '/webhook', body, {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      });
    });

    test('deduplicates messages with same ID', (done) => {
      const payload = {
        entry: [{
          changes: [{
            field: 'messages',
            value: {
              metadata: {},
              contacts: [{ wa_id: '14155550000', profile: { name: 'Dedup' } }],
              messages: [{
                id: 'wamid.dedup789',
                from: '14155550000',
                type: 'text',
                text: { body: 'Duplicate test' },
                timestamp: '1234567892',
              }],
            },
          }],
        }],
      };

      let count = 0;
      const handler = () => { count++; };
      provider.on('message', handler);

      const body = JSON.stringify(payload);
      const signature = sign(body, 'test-secret');

      // Send same message twice
      Promise.all([
        request(serverPort, 'POST', '/webhook', body, {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        }),
        request(serverPort, 'POST', '/webhook', body, {
          'Content-Type': 'application/json',
          'x-hub-signature-256': signature,
        }),
      ]).then(() => {
        // Small delay to let events propagate
        setTimeout(() => {
          provider.removeListener('message', handler);
          expect(count).toBe(1);
          done();
        }, 50);
      });
    });
  });

  describe('sendPoll fallback', () => {
    test('sendPoll formats as numbered text list', async () => {
      // Mock sendMessage to capture what gets sent
      const sent = [];
      const originalGraphPost = provider._graphPost.bind(provider);
      provider._graphPost = async (endpoint, payload) => {
        sent.push(payload);
        return { messages: [{ id: 'mock-id' }] };
      };

      await provider.sendPoll('14155551234@c.us', 'Pick one:', ['Option A', 'Option B', 'Option C']);

      expect(sent.length).toBe(1);
      expect(sent[0].type).toBe('text');
      expect(sent[0].text.body).toContain('*Pick one:*');
      expect(sent[0].text.body).toContain('1. Option A');
      expect(sent[0].text.body).toContain('2. Option B');
      expect(sent[0].text.body).toContain('3. Option C');
      expect(sent[0].text.body).toContain('Reply with a number');

      // Restore
      provider._graphPost = originalGraphPost;
    });
  });

  describe('getState', () => {
    test('returns CONNECTED when server is running', async () => {
      expect(await provider.getState()).toBe('CONNECTED');
    });

    test('returns DISCONNECTED after destroy', async () => {
      const p2 = createTestProvider();
      await p2.initialize();
      expect(await p2.getState()).toBe('CONNECTED');
      await p2.destroy();
      expect(await p2.getState()).toBe('DISCONNECTED');
    });
  });

  describe('chat ID normalization', () => {
    test('sendMessage strips @c.us for Graph API', async () => {
      const sent = [];
      const orig = provider._graphPost.bind(provider);
      provider._graphPost = async (endpoint, payload) => {
        sent.push(payload);
        return { messages: [{ id: 'mock-id' }] };
      };

      await provider.sendMessage('14155551234@c.us', 'Hello!');
      expect(sent[0].to).toBe('14155551234');

      provider._graphPost = orig;
    });
  });

  describe('404 for unknown routes', () => {
    test('returns 404 for non-webhook paths', async () => {
      const res = await request(serverPort, 'GET', '/unknown');
      expect(res.status).toBe(404);
    });
  });
});
