# dan. — Vocal Mixing & Editing

公式ポートフォリオサイト。白黒ミニマルデザイン、録音風に滑らかに流れる波形、料金・依頼の流れ・音源提出方法・修正ルールを掲載しています。

## Development

- Website: `public/index.html` (CSS / JavaScript / 波形画像・テンプレートZIPはHTMLに同梱)
- Policies: `public/terms.html`, `public/privacy.html`, `public/legal.html`
- Hosting: Cloudflare Workers Static Assets
- Config: `wrangler.jsonc`

## Deployment

Connect this repository (`main`) to the existing Cloudflare Worker named `dan-studio` in **Workers & Pages → dan-studio → Settings → Builds → Connect GitHub**.
Build command: none. Deploy command: `npx wrangler deploy`.

After the connection, pushing to `main` triggers a deployment. The site is available at the configured workers.dev address.

**Please review and complete legal/policy statements and payment/cancellation terms before accepting paid orders.** The website currently says 受付準備中.


## Stripe Checkout setup (not live yet)

- The public form lives at /request.html. Front-end pricing is for display only; src/index.js validates and recalculates prices on the server.
- D1 production database: dan-studio-orders. Tables: orders, webhook_events and checkout_limits.
- Before taking real payments: Verify Stripe eligibility, policies and legal disclosures. Configure Stripe webhook: https://dan-studio.yuseidayo88.workers.dev/api/stripe-webhook with checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired events.
- Add a restricted Stripe API key (STRIPE_API_KEY) and webhook secret (STRIPE_WEBHOOK_SECRET) as Cloudflare Worker secrets only; never put them in GitHub.
- After sandbox verification, set plaintext Worker variable PAYMENTS_ENABLED=true. Until then the form is visible but payments are disabled and /api/checkout returns 503.
- Test webhook signature verification and database paid status before enabling live charges. Monitor paid requests in D1 or build a protected admin notification workflow.

## Cloudflare Pages mirror

- Cloudflare Pages project: `danstudio` (GitHub main, output `public`).
- Assigned Pages URL: `https://danstudio-6zy.pages.dev/` (`danstudio.pages.dev` was not allocated by Cloudflare).
- `public/_worker.js` mirrors `src/index.js` for the Pages advanced-mode Worker; do not put live API credentials in either file.
- Original Worker stays live at the existing workers.dev URL until Pages is verified.
- Stripe stays disabled until separate Pages environment secrets and the matching webhook are configured and tested.
