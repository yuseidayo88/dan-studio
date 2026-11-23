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
- Before taking real payments: Verify Stripe eligibility, policies and legal disclosures. Configure Stripe webhook for the primary domain: https://danstudio-wav.pages.dev/api/stripe-webhook with checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired events.
- Add a restricted Stripe API key (STRIPE_API_KEY) and webhook secret (STRIPE_WEBHOOK_SECRET) as Cloudflare Worker secrets only; never put them in GitHub.
- After sandbox verification, set plaintext Worker variable PAYMENTS_ENABLED=true. Until then the form is visible but payments are disabled and /api/checkout returns 503.
- Test webhook signature verification and database paid status before enabling live charges. Monitor paid requests in D1 or build a protected admin notification workflow.

## Primary URL: Cloudflare Pages

- Preferred public URL: `https://danstudio-wav.pages.dev/`.
- Cloudflare Pages project: `danstudio-wav` (GitHub `main`, build output `public`). Every commit automatically deploys.
- Earlier Pages project: `danstudio` / `https://danstudio-6zy.pages.dev/` (legacy copy; no longer recommended to share).
- `public/_worker.js` mirrors `src/index.js` for Pages advanced-mode API. D1 is bound as `DB` to the Pages project.
- The original `dan-studio` Cloudflare Worker also remains live. No request traffic is redirected automatically.
- Stripe checkout remains intentionally disabled until Pages secrets and a verified production webhook are configured, tested, and legal disclosures are ready. The old webhook destination for the original Worker must not be reused blindly for the Pages site.

## Payment integration audit (2026-11-23)

Primary production environment: Cloudflare Pages project `danstudio-wav` (not the legacy Worker `dan-studio`).

- Pages settings: `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` are encrypted production secrets, `DB` is the `dan-studio-orders` D1 binding, and `PAYMENTS_ENABLED=false` until launch.
- Stripe webhook endpoint for the primary domain: `https://danstudio-wav.pages.dev/api/stripe-webhook`. This destination is disabled while keys and legal disclosures are being finalized.
- Order form: `public/request.html`. Pricing is recalculated on the server in matching `src/index.js` and `public/_worker.js`; does not trust client totals.
- Success page: `public/complete.html` polls `GET /api/order-status?session_id=...`, which returns only an order status, not customer data. The authoritative paid state comes from verified Stripe webhooks.
- Session expires in 60 minutes. Checkout creates an order in D1, creates a Stripe session, and stores its ID. Only verified webhooks set orders to `paid`.
- Tests: `node --test tests/payment.test.mjs`. GitHub Actions workflow: `.github/workflows/payment-tests.yml`. A deployed site and a committed test file do **not** constitute proof of a completed real Stripe transaction.
- Stripe Payment Method Configuration on the connected account showed `paypay.available=false` and `paypay.display_preference=off` at the time of review. PayPay cannot be promised until enabled and eligible.
- Before turning on live checkout, confirm that any API key and signing secret shown in screenshots have been rotated, that the **new** webhook signing secret matches the **new** endpoint, and that the webhook is enabled.
- The Stripe account statement descriptor was previously configured as `INWAVE`; confirm whether that branding is suitable for dan. before charging customers.
- Review and complete legally required identity disclosures / an effective on-request disclosure process, tax/pricing display, and the terms before enabling production.
- After those checks and a sandbox end-to-end test, explicitly change `PAYMENTS_ENABLED` to `true` in **Pages production** and redeploy. Do not enable it on the legacy Worker instead.
- Avoid putting Stripe credentials in GitHub, commit history, customer-visible error messages, or Cloudflare plain-text variables.

### Reviewing orders

In Cloudflare dashboard, open D1 database `dan-studio-orders` and run:

```sql
SELECT created_at, status, amount_jpy, plan, customer_name,
       customer_email, contact_handle, song_title, audio_url, video_url
FROM orders
ORDER BY created_at DESC
LIMIT 30;
```

This query contains customer information; access it only from the private Cloudflare Dashboard. Status `paid` means a signature-verified Stripe webhook was processed. Do not begin work merely because the customer visited the return page.

### Before production launch

1. Rotate any previously exposed credentials and verify a fresh signing secret is installed as a Pages Secret.
2. Test sandbox Checkout and `checkout.session.completed` plus async success / failure cases.
3. Confirm the Stripe webhook destination is enabled and its deliveries are successful.
4. Finalize tax-inclusive or tax-exclusive pricing and legal disclosure processes.
5. Check the Stripe statement descriptor and available payment methods.
6. Enable Pages production payments, redeploy, and monitor the first order in Stripe and D1.
