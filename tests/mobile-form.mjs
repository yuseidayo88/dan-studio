import { test } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browserPath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const url = new URL('../public/request.html', import.meta.url).href;
const widths = [320, 360, 375, 393, 430, 640, 768, 1024];

test('MIX checkout fits phone and desktop viewports, with usable conditional contact form', async () => {
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    for (const width of widths) {
      await page.setViewport({width, height: 850, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768});
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      const metrics = await page.evaluate(() => {
        const r = selector => {
          const rect=document.querySelector(selector).getBoundingClientRect();
          return {left:rect.left,right:rect.right,width:rect.width,height:rect.height};
        };
        return {
          viewport:window.innerWidth,
          scrollWidth:document.documentElement.scrollWidth,
          bodyScrollWidth:document.body.scrollWidth,
          plan:r('.plan-options'),
          form:r('#request-form'),
          summary:r('.review'),
          button:r('#payBtn'),
          contact:r('#contactMethod'),
          plans:[...document.querySelectorAll('.plan-body')].map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})),
        };
      });
      assert.ok(metrics.scrollWidth <= metrics.viewport + 2,
        'Horizontal overflow at '+width+'px: '+JSON.stringify(metrics));
      for (const [name,box] of Object.entries({form:metrics.form,summary:metrics.summary,button:metrics.button,contact:metrics.contact,plan:metrics.plan})) {
        assert.ok(box.left >= -2 && box.right <= metrics.viewport + 2,
          name+' clipped at '+width+'px: '+JSON.stringify(metrics));
      }
      for (const item of metrics.plans) {
        assert.ok(item.left >= -2 && item.right <= metrics.viewport + 2, 'Plan clipped at '+width+'px');
      }
      if (width <= 640) {
        const stacked = await page.evaluate(() => {
          const a=document.querySelectorAll('.plan-body');
          return a[1].getBoundingClientRect().top > a[0].getBoundingClientRect().bottom;
        });
        assert.ok(stacked, 'Pricing cards should stack on '+width+'px mobile');
      }
      console.log('PASS viewport '+width+'px: scrollWidth='+metrics.scrollWidth+'; summary and pricing fit.');
    }
    await page.setViewport({width:393,height:850,deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.select('#contactMethod','x');
    let contact=await page.$eval('#contactHandle', e=>({hidden:document.querySelector('#contactIdField').hidden,required:e.required,label:document.querySelector('#contactIdLabel').textContent}));
    assert.equal(contact.hidden,false);assert.equal(contact.required,true);assert.ok(contact.label.includes('X'));
    await page.select('#contactMethod','discord');
    contact=await page.$eval('#contactHandle', e=>({hidden:document.querySelector('#contactIdField').hidden,required:e.required,label:document.querySelector('#contactIdLabel').textContent}));
    assert.equal(contact.hidden,false);assert.equal(contact.required,true);assert.ok(contact.label.includes('Discord'));
    await page.select('#contactMethod','email');
    contact=await page.$eval('#contactHandle', e=>({hidden:document.querySelector('#contactIdField').hidden,required:e.required}));
    assert.equal(contact.hidden,true);assert.equal(contact.required,false);
    await page.click('.optional-info summary');
    assert.equal(await page.$eval('.optional-info',e=>e.open),true);
    assert.ok((await page.content()).includes('PayPayでのお支払いをご希望の方'));
    assert.ok((await page.content()).includes('Discordを開く'));
    console.log('PASS conditional X/Discord IDs, email, optional details, and PayPay contacts');
  } finally {await browser.close();}
});
