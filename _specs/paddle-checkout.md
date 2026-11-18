# Paddle checkout on /license/

Status: implemented for sandbox and tested end to end on 2026-11-10 (Basic, from Kelowna: card CA$726.88,
checkout CA$726.88, redirect to /welcome/, transaction.completed delivered with origin "web" and a
one-year billing_period).

## Scope

Replace the mailto "Buy" buttons for Basic and Advanced on `/license/` with Paddle
Checkout, sandbox first. Enterprise and the academic/open-source offer stay as mailto.

Out of scope: issuing the licence after payment (see open question 1).

## Paddle's prompt against this site

The prompt assumes a 3-tier, monthly/yearly app with a server (Next.js on Vercel).
jheapo.com is a static Jekyll site on GitHub Pages, so some steps change or drop out.

| Prompt asks for | Here |
|---|---|
| Starter / Pro / Advanced | Basic and Advanced. Enterprise is not sold through Paddle. |
| Monthly/yearly toggle | None. Prices are annual only. |
| Country from request headers, server-side | No server. Call `Paddle.PricePreview()` without an address; Paddle.js detects the country from the visitor's IP. |
| `@paddle/paddle-js` (npm) | Paddle.js v2 from Paddle's CDN: `https://cdn.paddle.com/paddle/v2/paddle.js`. The site has no npm build. |
| Environment and client token from env vars, `.env.example` | Jekyll has no runtime environment. Two keys in `_config.yml` (below), documented in its comments. Client-side tokens are public by design: they end up in the page source either way. |
| Fail loudly if the environment is unset | The page script throws if `paddle.environment` is not `sandbox` or `production`, or the token is empty. The Buy buttons stay disabled and the page says checkout is unavailable. No default. |
| Server API key never in client code | This site has no server API key. |
| Prefill email if signed in | The site has no sign-in. Not applicable. |
| Show only `formattedTotals`, no price arithmetic or reformatting | Yes. The card shows Paddle's string as is. Which total: open question 3. |
| `successUrl` → `/welcome` | `window.location.origin + '{{ site.baseurl }}/welcome/'`. It must be absolute, and this works on both localhost and www.jheapo.com. |
| Default payment link via MCP | No `paddle-sandbox` MCP in this session. It is currently empty. It should be `https://www.jheapo.com/license/` (the page that loads Paddle.js). Open question 5. |
| Read payment methods, tax mode, balance currency | Read from the sandbox dashboard on 2026-11-10: cards, PayPal, Apple Pay and Bancontact on; Google Pay, iDEAL, Pix, UPI, BLIK, MB WAY, WeChat Pay, Korean local cards, Naver Pay, KakaoPay, Samsung Pay and Payco off; saved cards off; checkout recovery on. I could not find the sales tax mode or the balance currency in the dashboard. Open question 4. Nothing changed. |

## Configuration

`_config.yml`:

```yaml
paddle:
  # sandbox | production. Required: checkout is disabled when this is missing or unknown.
  environment: sandbox
  # Client-side token from Developer tools > Authentication. Sandbox tokens start with test_.
  client_token: ""
```

Going live means changing these two values and the price IDs.

## Plans

New `_data/plans.yml` replaces the hand-written Basic and Advanced cards. Sandbox and
production use different price IDs, so each plan has one per environment:

```yaml
- name: Basic
  features:
    - Email support for installation and use
    - Bug fixes
    - Every new release while your subscription is active
  price_id:
    sandbox: pri_01m73vzfe37ncczvp57jcraape
    production: ""
- name: Advanced
  features:
    - Everything in Basic
    - Highest priority for support and bug fixes
    - Help with the heap-analysis questions themselves, not just the tool
    - Priority consideration for the features you ask for
  price_id:
    sandbox: pri_01m73w3ey7a4gekq1a8mjspkzq
    production: ""
```

The Enterprise card stays in `license.html`.

## Page behaviour

1. Only `/license/` loads Paddle.js (front matter `paddle: true`, picked up in `_includes/head.html`).
2. `license.html` renders each plan card from `_data/plans.yml`. Each card holds its price ID in a
   `data-` attribute and has an empty price element. Environment, token and success URL go on the
   page as `data-` attributes.
3. `assets/js/checkout.js` reads that configuration, validates it (see "Fail loudly"),
   sets the Paddle environment and calls `Paddle.Initialize({ token })`.
4. A single `Paddle.PricePreview()` call covers both price IDs, with no address. Each card shows its
   line item's formatted total. Until the preview returns, the price element is empty. If the
   preview fails: open question 3.
5. Buy calls `Paddle.Checkout.open({ items: [{ priceId, quantity: 1 }], settings: { displayMode:
   'overlay', variant: 'one-page', successUrl } })`. Quantity is the number of seats. The
   buyer changes it in the overlay, which allows quantities 1–100 (the price's default range).
6. Buy stays disabled until Paddle returns both prices. If the configuration is invalid or
   the preview fails, the error is logged to the console and the page shows "Online purchase
   is not available right now" with the licence email address.

## /welcome/

New page `welcome.html`, permalink `/welcome/`, not linked from the nav. Its text depends on
open question 1.

## Test (sandbox, end to end)

1. Run `bundle exec jekyll serve` on the Mac. Open `http://localhost:4000/license/` in the
   Claude desktop app's built-in browser.
2. Both cards show a price from Paddle. From Kelowna that should be CAD 649 and CAD 789,
   plus tax if `total` is chosen.
3. Each Buy opens the one-page overlay with the same price as its card.
4. Pay with Paddle's sandbox test card 4242 4242 4242 4242. Checkout redirects to `/welcome/`, and
   the transaction appears under Transactions in the sandbox dashboard.
5. Blank `paddle.environment`, rebuild: Buy is disabled, the page says checkout is unavailable,
   and the console shows the error.

Only the visitor's own country can be checked this way. The other country prices were checked
in the dashboard when the catalogue was created.

## Decisions (2026-11-10)

1. **Licence delivery** will be solved before going live. Until then, `/welcome/` says the
   licence will be sent to the checkout email address.
2. **Seats:** more than one can be bought. The buyer sets the quantity in the overlay.
3. **Displayed figure:** provisional `total` (includes the visitor's sales tax), set by
   `paddle.display_total` in `_config.yml`. Revisit after seeing the whole process, since
   European buyers may be surprised. If the preview fails, Buy stays disabled.
4. **Sales tax mode and balance currency:** balance currency still unknown. Tax: the CA prices
   exclude tax. From Kelowna the preview showed CAD 649 + 12% (GST and BC PST) = CA$726.88. In the
   overlay, before a postal code is entered, Paddle estimates GST only (CA$681.45); with a BC postal
   code it returns to CA$726.88. So the card figure (`total`) can differ from the first figure the
   overlay shows until the buyer enters an address.
5. **Default payment link:** set in the sandbox to `https://www.jheapo.com/license/` on
   2026-11-10. Paddle requires it before it will create a transaction. Live needs the same
   setting once the domain is approved.
6. **Client-side token:** sandbox token "jheapo.com website" created on 2026-11-10 and set in
   `_config.yml`.

## Implementation

| File | Change |
|---|---|
| `_config.yml` | `paddle.environment`, `paddle.client_token`, `paddle.display_total` |
| `_data/plans.yml` | New: Basic and Advanced, with features and price IDs per environment |
| `license.html` | Basic and Advanced cards rendered from `_data/plans.yml`; `paddle: true`; error message |
| `_layouts/default.html` | Loads Paddle.js and `assets/js/checkout.js` only on pages with `paddle: true` |
| `assets/js/checkout.js` | New: validates config, initializes Paddle, shows prices, opens checkout |
| `welcome.html` | New: `/welcome/` |
| `assets/css/main.css` | Button and error styles |

The configuration check rejects: Paddle.js not loaded; an environment other than
`sandbox`/`production`; a token without the matching `test_`/`live_` prefix; an unknown
`display_total`; and a plan with no price ID for the environment.

## Notes

- The page copy uses "license" as a noun ("JHeapo licenses", "A license covers one seat").
  By your spelling rule, those should be "licence".
- `_config.yml` has `url: "https://jheapo.github.io"`, but the CNAME is `www.jheapo.com`.
  This doesn't affect checkout, because `successUrl` is built from the page's own origin.
- This repo publishes the site. `_specs/` is not published by Jekyll, but the file is
  public on GitHub once you commit it.
