import assert from 'node:assert/strict';

const base = 'https://danstudio-wav.pages.dev';
const testCase = 'DAN_INTERNAL_CHECKOUT_SMOKE_2026_11_23';
const config = await fetch(base + '/api/checkout-config', {cache:'no-store'});
assert.equal(config.status, 200, 'Live checkout config endpoint');
const c = await config.json();
assert.equal(c.available, true, 'Production checkout should be enabled');

const order = {
  plan:'short',vocalTracks:1,additionalSingers:0,harmony:false,videoSync:false,
  videoUrl:'',name:'dan. payment smoke test',email:'ci-test@example.com',
  contactMethod:'x',contactHandle:'@dan_internal_smoke',
  songTitle:testCase,originalUrl:'https://example.com/song',audioUrl:'https://example.com/test.zip',
  referenceUrl:'',requestedDate:'',notes:'Automated smoke test: DO NOT FULFILL',needsQuote:false,
  acceptTerms:true,website:''
};
const response = await fetch(base + '/api/checkout',{
  method:'POST',headers:{'origin':base,'content-type':'application/json'},body:JSON.stringify(order)
});
const result = await response.json();
assert.equal(response.status, 200, 'Stripe checkout creation response: ' + response.status + ' ' + (result.error||''));
assert.ok(result.checkoutUrl?.startsWith('https://checkout.stripe.com/'),'Stripe hosted Checkout URL');
console.log('PASS: Generated real unpaid Checkout Session through public dan. form backend; no payment attempted');
