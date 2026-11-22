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

