import test from 'node:test';
import assert from 'node:assert/strict';

const base = 'https://danstudio-wav.pages.dev';
async function request(path, opts = {}) {
  const signal = AbortSignal.timeout(12000);
  return fetch(base + path, { ...opts, signal, redirect:'follow' });
}

test('homepage and disclosure reachable on deployed Pages', async () => {
  const [home,legal,order] = await Promise.all([request('/'),request('/legal.html'),request('/request.html')]);
  assert.equal(home.status, 200, 'home');
  assert.equal(legal.status, 200, 'legal');
  assert.equal(order.status, 200, 'order form');
  const [html,disclosure,form] = await Promise.all([home.text(), legal.text(), order.text()]);
  assert.ok(html.includes('無償MIX募集'), 'homepage should have monitor text');
  assert.ok(disclosure.includes('特定商取引法'), 'legal information must be available');
  assert.ok(disclosure.includes('ショート（60秒以内）2,000円'), 'legal should show price');
  assert.ok(form.includes('videoSync'), 'option should be present in the form');
});

test('live checkout API, DB and secret signature gate respond correctly', async () => {
  const cfg = await request('/api/checkout-config');
  assert.equal(cfg.status, 200, 'backend is reachable');
  const body = await cfg.json();
  assert.equal(typeof body.available, 'boolean');
  // This smoke test intentionally creates no payment and uses no private user data.
  const status = await request('/api/order-status?session_id=not_a_checkout_session');
  assert.equal(status.status, 400, 'order status API should validate session IDs');
  const result = await status.json();
  assert.equal(result.status, 'unknown');

  const badWebhook = await request('/api/stripe-webhook',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({id:'evt_untrusted_smoke_test',type:'checkout.session.completed'})
  });
  assert.equal(badWebhook.status, 400, 'unsigned webhook should be rejected (secret must be configured)');

  if(body.available===false) {
    const blocked = await request('/api/checkout',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'});
    assert.equal(blocked.status,503, 'production checkout must stay disabled');
  }
});
