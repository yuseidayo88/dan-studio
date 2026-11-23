import assert from 'node:assert/strict';

const base = 'https://danstudio-wav.pages.dev';
const testCase = 'DAN_MINIMAL_CHECKOUT_SMOKE_2026_11_23';
const config = await fetch(base + '/api/checkout-config', {cache:'no-store'});
assert.equal(config.status, 200, 'Live checkout config endpoint');
const c = await config.json();
assert.equal(c.available, true, 'Production checkout should be enabled');

const order = {
  plan:'short',vocalTracks:1,additionalSingers:0,harmony:false,videoSync:false,
  name:'dan. minimum-input smoke test',email:'ci-test@example.com',
  contactMethod:'email',contactHandle:'',songTitle:'',originalUrl:'',audioUrl:'',
  referenceUrl:'',requestedDate:'',notes:testCase+' / DO NOT FULFILL',
  needsQuote:false,acceptTerms:true,website:''
};
const response = await fetch(base + '/api/checkout',{
  method:'POST',headers:{'origin':base,'content-type':'application/json'},body:JSON.stringify(order)
});
const result = await response.json();
assert.equal(response.status, 200, 'Stripe checkout creation response: ' + response.status + ' ' + (result.error||''));
assert.ok(result.checkoutUrl?.startsWith('https://checkout.stripe.com/'),'Stripe hosted Checkout URL');
console.log('PASS: Minimal name-and-email Checkout Session created on production; no song/audio required; no payment attempted');
