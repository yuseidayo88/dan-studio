import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
const workerSource = readFileSync(new URL('../public/_worker.js', import.meta.url), 'utf8');
const oldWorkerSource = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
assert.equal(workerSource, oldWorkerSource, 'Pages and Worker server implementations must match');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64'));

function database() {
  const orders = new Map(), limits = new Map(), events = new Set();
  const db = {
    orders, events,
    prepare(sql) {
      return {
        bind(...v) {
          return {
            async first() {
              if(sql.startsWith('SELECT count FROM checkout_limits')) return {count:limits.get(v[0])||0};
              if(sql.startsWith('SELECT id,amount_jpy,stripe_session_id,status FROM orders WHERE id=')) {
                const x=orders.get(v[0]);return x ? {...x} : null;
              }
              if(sql.startsWith('SELECT event_id FROM webhook_events')) return events.has(v[0])?{event_id:v[0]}:null;
              if(sql.startsWith('SELECT status FROM orders WHERE stripe_session_id=')) {
                const x=[...orders.values()].find(x=>x.stripe_session_id===v[0]);return x?{status:x.status}:null;
              }
              throw Error('Unexpected DB query: '+sql);
            },
            async run() {
              if(sql.startsWith('INSERT INTO checkout_limits')) {limits.set(v[0],(limits.get(v[0])||0)+1);return;}
              if(sql.startsWith('INSERT INTO orders')) {
                orders.set(v[0],{id:v[0],status:v[1],amount_jpy:v[2],plan:v[3],stripe_session_id:null,video_sync:v[16],video_url:v[17]});return;
              }
              if(sql.startsWith('UPDATE orders SET stripe_session_id=')) {orders.get(v[1]).stripe_session_id=v[0];return;}
              if(sql.startsWith("UPDATE orders SET status='checkout_error'")) {orders.get(v[0]).status='checkout_error';return;}
              if(sql.startsWith('UPDATE orders SET status=')) {
                const x=orders.get(v[4]);x.status=v[0];x.stripe_session_id=x.stripe_session_id||v[1];return;
              }
              if(sql.startsWith('INSERT OR IGNORE INTO webhook_events')) {events.add(v[0]);return;}
              throw Error('Unexpected DB write: '+sql);
            }
          };
        }
      };
    },
    async batch(stmts) {for(const stmt of stmts) await stmt.run();}
  };
  return db;
}

const origin='https://danstudio-wav.pages.dev';
const key='rk_test_FAKE_TEST_KEY_NOT_USABLE', secret='whsec_FAKE_TEST_ONLY';
const validOrder={
  plan:'short', harmony:true, videoSync:true, videoUrl:'https://files.example.test/video.mp4',
  vocalTracks:5,additionalSingers:1,
  name:'demo',email:'buyer@example.test',contactMethod:'x',contactHandle:'@demo',
  songTitle:'Test song',originalUrl:'https://example.com/song',audioUrl:'https://files.example.test/wav.zip',
  referenceUrl:'',requestedDate:'',notes:'',needsQuote:false,website:'',acceptTerms:true
};
const envFor=(db,pay='true')=>({DB:db,PAYMENTS_ENABLED:pay,STRIPE_API_KEY:key,STRIPE_WEBHOOK_SECRET:secret,ASSETS:{fetch:()=>new Response('static')}});

function orderRequest(data) {
 return new Request(origin+'/api/checkout',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify(data)});
}

test('payments remain disabled without explicit flag',async()=>{
 const db=database();
 const env=envFor(db,'false');
 const cfg=await (await worker.fetch(new Request(origin+'/api/checkout-config'),env)).json();
 assert.deepEqual(cfg,{available:false});
 assert.equal((await worker.fetch(orderRequest(validOrder),env)).status,503);
 assert.equal(db.orders.size,0);
});
test('reject inherited-object plan names and missing video URL',async()=>{
 const env=envFor(database());
 assert.equal((await worker.fetch(orderRequest({...validOrder,plan:'toString'}),env)).status,400);
 assert.equal((await worker.fetch(orderRequest({...validOrder,videoUrl:''}),env)).status,400);
});
test('checkout pricing, video request, signature validation, webhook fulfillment and customer status',async()=>{
 const db=database(), env=envFor(db);
 const session='cs_test_abcdefghijklmnop';
 let stripeBody;
 const savedFetch=globalThis.fetch;
 globalThis.fetch=async (_url,opts)=>{
   stripeBody=new URLSearchParams(opts.body);
   assert.equal(opts.headers['Stripe-Version'],'2026-11-18.endive');
   return new Response(JSON.stringify({id:session,url:'https://checkout.stripe.com/c/pay/fake-test-only'}),{status:200,headers:{'content-type':'application/json'}});
 };
 try {
   const checkout=await worker.fetch(orderRequest(validOrder),env);
   assert.equal(checkout.status,200);
   assert.ok((await checkout.json()).checkoutUrl.startsWith('https://checkout.stripe.com/'));
   assert.equal(stripeBody.get('line_items[0][price_data][unit_amount]'),'7500');
   assert.equal(stripeBody.get('line_items[0][price_data][currency]'),'jpy');
   assert.equal(stripeBody.get('success_url'),origin+'/complete.html?session_id={CHECKOUT_SESSION_ID}');
   assert.ok(Number(stripeBody.get('expires_at'))>Math.floor(Date.now()/1000)+3400);
   assert.ok(!stripeBody.toString().includes('payment_method_types'));
   assert.equal(db.orders.size,1);
   const [order]=db.orders.values();
   assert.equal(order.amount_jpy,7500);
   assert.equal(order.video_sync,1);
   assert.equal(order.video_url,validOrder.videoUrl);
   const before=await (await worker.fetch(new Request(origin+'/api/order-status?session_id='+session),env)).json();
   assert.equal(before.status,'pending');
   const event={id:'evt_test_1',type:'checkout.session.completed',data:{object:{id:session,client_reference_id:order.id,amount_total:7500,currency:'jpy',payment_status:'paid',payment_intent:'pi_test_123'}}};
   const payload=JSON.stringify(event), stamp=String(Math.floor(Date.now()/1000));
   const bad=await worker.fetch(new Request(origin+'/api/stripe-webhook',{method:'POST',body:payload,headers:{'Stripe-Signature':stamp+'.invalid'}}),env);
   assert.equal(bad.status,400);
   assert.equal(order.status,'awaiting_payment');
   const signature=createHmac('sha256',secret).update(stamp+'.'+payload).digest('hex');
   const headers={'Stripe-Signature':'t='+stamp+',v1='+signature};
   const ok=await worker.fetch(new Request(origin+'/api/stripe-webhook',{method:'POST',body:payload,headers}),env);
   assert.equal(ok.status,200);
   assert.equal(order.status,'paid');
   assert.equal(db.events.size,1);
   const replay=await worker.fetch(new Request(origin+'/api/stripe-webhook',{method:'POST',body:payload,headers}),env);
   assert.equal(replay.status,200);
   assert.equal(db.events.size,1);
   const after=await (await worker.fetch(new Request(origin+'/api/order-status?session_id='+session),env)).json();
   assert.equal(after.status,'paid');
 } finally {globalThis.fetch=savedFetch;}
});
