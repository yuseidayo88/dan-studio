const PRICES = Object.freeze({ short: 2000, one: 3000, full: 4000 });
const LABELS = Object.freeze({ short: 'ショートMIX', one: 'ワンコーラスMIX', full: 'フルコーラスMIX' });
const MAX_BODY = 12000;
const json = (value, status=200) => new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const normalize = (x, max) => typeof x === 'string' ? x.trim().slice(0,max) : '';
const httpsURL = (s) => { try { const u=new URL(s); return u.protocol==='https:' && Boolean(u.hostname) && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname); } catch { return false; } };
const enabled = (env) => env.PAYMENTS_ENABLED==='true' && !!env.STRIPE_API_KEY && !!env.STRIPE_WEBHOOK_SECRET && !!env.DB;
const parseOrder = (p) => {
  if(!p || typeof p !== 'object' || Array.isArray(p)) throw Error('入力内容を確認してください。');
  const plan = normalize(p.plan,20);
  if(!Object.hasOwn(PRICES,plan)) throw Error('プランを選択してください。');
  const vocalTracks = Number(p.vocalTracks);
  const additionalSingers = Number(p.additionalSingers);
  if(!Number.isInteger(vocalTracks)||vocalTracks<1||vocalTracks>12) throw Error('ボーカルトラック数を確認してください。');
  if(!Number.isInteger(additionalSingers)||additionalSingers<0||additionalSingers>4) throw Error('参加人数を確認してください。');
  const harmony = p.harmony===true;
  const videoSync = p.videoSync===true;
  const videoUrl = normalize(p.videoUrl,500);
  if(videoSync && !httpsURL(videoUrl)) throw Error('動画合わせには、完成済み動画の共有URLが必要です。');
  const name = normalize(p.name,80);
  const email = normalize(p.email,140);
  const contactMethod = normalize(p.contactMethod,20);
  const contactHandle = normalize(p.contactHandle,140);
  const songTitle = normalize(p.songTitle,160);
  const originalUrl = normalize(p.originalUrl,500);
  const audioUrl = normalize(p.audioUrl,500);
  const referenceUrl = normalize(p.referenceUrl,500);
  const requestedDate = normalize(p.requestedDate,10);
  const notes = normalize(p.notes,1200);
  if(!name||!songTitle||!contactHandle) throw Error('必須項目を入力してください。');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('メールアドレスを確認してください。');
  if(!['x','discord','email'].includes(contactMethod)) throw Error('連絡方法を選択してください。');
  if(!httpsURL(originalUrl)||!httpsURL(audioUrl)||(referenceUrl&&!httpsURL(referenceUrl))) throw Error('音源URLはhttps://から始まる有効なリンクにしてください。');
  if(requestedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) throw Error('希望納期を確認してください。');
  if(p.needsQuote===true) throw Error('複雑な編集は、決済前にXのDMでお見積もりをご相談ください。');
  if(p.acceptTerms!==true) throw Error('利用規約への同意が必要です。');
  if(normalize(p.website,100)) throw Error('受付できませんでした。');
  const amount = PRICES[plan] + (harmony?1500:0) + (videoSync?500:0) + additionalSingers*2500 + Math.max(0,vocalTracks-3)*500;
  return {plan,vocalTracks,additionalSingers,harmony,videoSync,videoUrl:videoSync?videoUrl:'',name,email,contactMethod,contactHandle,songTitle,originalUrl,audioUrl,referenceUrl,requestedDate,notes,amount};
};
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
function randomLetters(n=8){const b=crypto.getRandomValues(new Uint8Array(n));return Array.from(b,x=>String.fromCharCode(97+x%26)).join('');}
async function rateLimit(request,env){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const window=Math.floor(Date.now()/900000);
  const raw=new TextEncoder().encode(ip+'|'+window);
  const key=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)));
  await env.DB.prepare('INSERT INTO checkout_limits (key,count,updated_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1, updated_at=excluded.updated_at').bind(key,Math.floor(Date.now()/1000)).run();
  const count=(await env.DB.prepare('SELECT count FROM checkout_limits WHERE key=?').bind(key).first())?.count||1;
  if(count>5) throw Error('短時間でのお申し込みが多いため、時間を置いてお試しください。');
}
async function checkout(request,env){
  if(!enabled(env)) return json({error:'現在Stripe決済の受付準備中です。'},503);
  if(request.headers.get('Origin')!==new URL(request.url).origin) return json({error:'送信元を確認できません。'},403);
  if(!request.headers.get('content-type')?.includes('application/json')) return json({error:'送信形式が正しくありません。'},415);
  if(Number(request.headers.get('content-length')||0)>MAX_BODY) return json({error:'入力内容が大きすぎます。'},413);
  const raw=await request.text();if(raw.length>MAX_BODY) return json({error:'入力内容が大きすぎます。'},413);
  let data;
  try {data=parseOrder(JSON.parse(raw));await rateLimit(request,env)}catch(e){return json({error:e.message||'入力をご確認ください。'},400)}
  const id=crypto.randomUUID(); const expirationEpoch=Math.floor(Date.now()/1000)+3600; const expiresAt=new Date(expirationEpoch*1000).toISOString();
  try {
    await env.DB.prepare('INSERT INTO orders (id,status,amount_jpy,plan,customer_name,customer_email,contact_method,contact_handle,song_title,original_url,audio_url,reference_url,requested_date,vocal_tracks,additional_singers,harmony,video_sync,video_url,notes,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(
      id,'awaiting_payment',data.amount,data.plan,data.name,data.email,data.contactMethod,data.contactHandle,data.songTitle,data.originalUrl,data.audioUrl,data.referenceUrl,data.requestedDate,data.vocalTracks,data.additionalSingers,data.harmony?1:0,data.videoSync?1:0,data.videoUrl,data.notes,expiresAt
    ).run();
    const url = new URL(request.url);
    if(url.protocol!=='https:') return json({error:'安全な接続が必要です。'},400);
    const params = new URLSearchParams();
    params.set('mode','payment');
    params.set('expires_at',String(expirationEpoch));
    params.set('locale','ja');
    params.set('customer_email',data.email);
    params.set('client_reference_id',id);
    params.set('success_url',url.origin+'/complete.html?session_id={CHECKOUT_SESSION_ID}');
    params.set('cancel_url',url.origin+'/request.html?cancelled=1');
    params.set('line_items[0][price_data][currency]','jpy');
    params.set('line_items[0][price_data][unit_amount]',String(data.amount));
    params.set('line_items[0][price_data][product_data][name]','dan. '+LABELS[data.plan]);
    params.set('line_items[0][price_data][product_data][description]','歌唱者追加 '+data.additionalSingers+'名 / ボーカル '+data.vocalTracks+'本 / ハモリ生成 '+(data.harmony?'あり':'なし')+' / 動画合わせ '+(data.videoSync?'あり':'なし'));
    params.set('line_items[0][quantity]','1');
    params.set('metadata[order_id]',id);
    params.set('metadata[contact_method]',data.contactMethod);
    params.set('metadata[contact_handle]',data.contactHandle);
    params.set('metadata[song_title]',data.songTitle);
    params.set('payment_intent_data[metadata][order_id]',id);
    params.set('integration_identifier','dan_mixing_'+randomLetters());
    const stripe=await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',headers:{'Authorization':'Bearer '+env.STRIPE_API_KEY,'Content-Type':'application/x-www-form-urlencoded','Stripe-Version':'2026-11-18.endive','Idempotency-Key':'dan-order-'+id},
      body:params.toString()
    });
    const result=await stripe.json();
    if(!stripe.ok||!result.id||!result.url||!result.url.startsWith('https://checkout.stripe.com/')) throw Error('Stripe決済画面の生成に失敗しました。');
    await env.DB.prepare("UPDATE orders SET stripe_session_id=?,updated_at=datetime('now') WHERE id=?").bind(result.id,id).run();
    return json({checkoutUrl:result.url});
  } catch(err) {
    await env.DB.prepare("UPDATE orders SET status='checkout_error',updated_at=datetime('now') WHERE id=?").bind(id).run().catch(()=>{});
    return json({error:'決済の準備ができませんでした。XのDMからお問い合わせください。'},502);
  }
}
async function verifyStripeSignature(payload,header,secret){
  if(!header||!secret) return false;
  const fields=header.split(',').map(s=>s.trim());
  const stamp=fields.find(x=>x.startsWith('t='))?.slice(2);
  const signatures=fields.filter(x=>x.startsWith('v1=')).map(x=>x.slice(3));
  if(!stamp||!/^\d+$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300) return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signed=new TextEncoder().encode(stamp+'.'+payload);
  for(const signature of signatures) {
    if(!/^[a-f0-9]{64}$/i.test(signature)) continue;
    const sig=new Uint8Array(signature.match(/../g).map(x=>parseInt(x,16)));
    if(await crypto.subtle.verify('HMAC',key,sig,signed)) return true;
  }
  return false;
}
async function webhook(request,env){
  if(!env.DB||!env.STRIPE_WEBHOOK_SECRET) return new Response('Not configured',{status:503});
  const payload=await request.text();
  if(payload.length>250000) return new Response('Payload too large',{status:413});
  const verified=await verifyStripeSignature(payload,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET);
  if(!verified) return new Response('Invalid signature',{status:400});
  let event;try{event=JSON.parse(payload)}catch{return new Response('Invalid JSON',{status:400})}
  if(!event.id||!event.type) return new Response('Invalid event',{status:400});
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type)) return new Response('ok');
  const session=event.data?.object;
  const orderId=session?.client_reference_id||session?.metadata?.order_id;
  if(!orderId||!session?.id) return new Response('unrelated event');
  const order=await env.DB.prepare('SELECT id,amount_jpy,stripe_session_id,status FROM orders WHERE id=?').bind(orderId).first();
  if(!order) return new Response('unrelated order');
  if(order.stripe_session_id&&order.stripe_session_id!==session.id) return new Response('Session mismatch',{status:400});
  if(Number(session.amount_total)!==Number(order.amount_jpy)||String(session.currency)!=='jpy') return new Response('Amount mismatch',{status:400});
  const seen=await env.DB.prepare('SELECT event_id FROM webhook_events WHERE event_id=?').bind(event.id).first();
  if(seen) return new Response('ok');
  let status=order.status;
  if((event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded')&&session.payment_status==='paid')status='paid';
  else if(event.type==='checkout.session.async_payment_failed'&&status!=='paid')status='payment_failed';
  else if(event.type==='checkout.session.expired'&&status!=='paid')status='expired';
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status=?,stripe_session_id=COALESCE(stripe_session_id,?),stripe_payment_intent=COALESCE(?,stripe_payment_intent),paid_at=CASE WHEN ?='paid' THEN COALESCE(paid_at,datetime('now')) ELSE paid_at END,updated_at=datetime('now') WHERE id=?").bind(status,session.id,session.payment_intent||null,status,orderId),
    env.DB.prepare('INSERT OR IGNORE INTO webhook_events (event_id,event_type) VALUES (?,?)').bind(event.id,event.type)
  ]);
  return new Response('ok');
}
async function orderStatus(request,env){
  if(!env.DB) return json({error:'Not configured'},503);
  const id=new URL(request.url).searchParams.get('session_id')||'';
  if(!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return json({status:'unknown'},400);
  const order=await env.DB.prepare('SELECT status FROM orders WHERE stripe_session_id=?').bind(id).first();
  if(!order) return json({status:'unknown'},404);
  const state=order.status==='paid'?'paid':order.status==='payment_failed'?'failed':order.status==='expired'?'expired':'pending';
  return json({status:state});
}
export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    try {
      if(path==='/api/checkout-config'&&request.method==='GET') return json({available:enabled(env)});
      if(path==='/api/order-status'&&request.method==='GET') return orderStatus(request,env);
      if(path==='/api/checkout'&&request.method==='POST') return checkout(request,env);
      if(path==='/api/stripe-webhook'&&request.method==='POST') return webhook(request,env);
      if(path.startsWith('/api/'))return json({error:'Not found'},404);
      return env.ASSETS.fetch(request);
    }catch(e) { console.error('dan worker handler failure',e?.name||'error');return json({error:'処理中に問題が発生しました。お時間をおいて再度お試しください。'},500); }
  }
};