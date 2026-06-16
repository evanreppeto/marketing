# Social Connections — Credential Setup Guide

How to obtain every `META_*`, `LINKEDIN_*`, and `X_*` value the social connections
feature reads. These are **control-plane secrets**: they live only in this app's
environment (Vercel), never in the database and never on the Arc runtime.
Arc proposes social posts; the app executes them after approval, using these creds.

> **Vercel notes**
> - Paste each value with **no surrounding quotes**.
> - Set them for the environments you need (Production / Preview / Development).
> - Env-var changes only take effect on the **next deploy** — redeploy after editing.

Status in the Connections panel keys off **env-var presence**: a provider flips from
**Not configured** → **Connected** once all of its required vars are set.

---

## Meta — `META_*` (Facebook Page + Instagram, one app)

All five values come from **one** Meta app. Instagram must be a **Business or Creator**
account **linked to your Facebook Page**.

| Env var | Gates | Where it comes from |
|---|---|---|
| `META_APP_ID` | both | App settings → Basic |
| `META_APP_SECRET` | both | App settings → Basic (click *Show*) |
| `META_PAGE_ID` | Facebook | `GET /me/accounts` response |
| `META_PAGE_ACCESS_TOKEN` | Facebook + Instagram | long-lived Page token (steps below) |
| `META_IG_USER_ID` | Instagram | `GET /<page-id>?fields=instagram_business_account` |

**1. Create the app → `META_APP_ID`, `META_APP_SECRET`**
- developers.facebook.com → *My Apps* → **Create App** → type **Business**.
- **App settings → Basic**: copy **App ID**; click **Show** for **App Secret**.
- Add products: **Facebook Login** (to mint a token) and **Instagram Graph API**.

**2. Mint a long-lived Page token → `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID`**
- Open the **Graph API Explorer** (developers.facebook.com/tools/explorer), select your app,
  **Generate Access Token**, and grant:
  `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`,
  `instagram_basic`, `instagram_content_publish`.
- Exchange the short-lived user token for a long-lived one:
  ```
  GET https://graph.facebook.com/v21.0/oauth/access_token
      ?grant_type=fb_exchange_token
      &client_id=<META_APP_ID>
      &client_secret=<META_APP_SECRET>
      &fb_exchange_token=<SHORT_LIVED_USER_TOKEN>
  ```
- Fetch the Page token (effectively non-expiring when derived from a long-lived user token):
  ```
  GET https://graph.facebook.com/v21.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>
  ```
  Copy the Page's `id` → `META_PAGE_ID` and its `access_token` → `META_PAGE_ACCESS_TOKEN`.

**3. Find the Instagram account → `META_IG_USER_ID`**
```
GET https://graph.facebook.com/v21.0/<META_PAGE_ID>?fields=instagram_business_account&access_token=<META_PAGE_ACCESS_TOKEN>
```
`instagram_business_account.id` → `META_IG_USER_ID`. If null: the IG account isn't
Business/Creator or isn't linked to the Page (fix in the IG app → *Settings → Account
type / Linked accounts*).

**Gotcha:** publishing typically needs **Advanced Access** for `instagram_content_publish`
/ `pages_manage_posts` (App Review). While the app is in **Development mode** you can publish
to accounts where the user holds an **app role** (admin/developer/tester) — fine for your own
brand accounts. Add yourself under *App roles* so it works before review.

**Sanity check:** `GET /v21.0/me?access_token=<META_PAGE_ACCESS_TOKEN>` returns the Page name.

---

## LinkedIn — `LINKEDIN_*`

| Env var | Where it comes from |
|---|---|
| `LINKEDIN_ACCESS_TOKEN` | OAuth 2.0 token (Token Generator) |
| `LINKEDIN_ORG_URN` | `urn:li:organization:<id>` |

1. **linkedin.com/developers → Create app**, associate it with your **Company Page**, verify
   (a page admin clicks the verification link). The **Auth** tab shows Client ID + Secret.
2. **Products** tab → request **Community Management API** (enables posting *as the org*,
   scope `w_organization_social`). Needs LinkedIn approval — request early. (`w_member_social`
   posts as a person and needs no approval, if you prefer a personal profile.)
3. `LINKEDIN_ACCESS_TOKEN`: **Auth → OAuth 2.0 tools → Token Generator**, select scopes
   (`w_organization_social`, `r_organization_social`), generate. Tokens expire in **~60 days**
   (refresh tokens ~1 year if enabled) — re-mint until the refresh flow is wired.
4. `LINKEDIN_ORG_URN`: `urn:li:organization:<id>`, where `<id>` is the number in your Company
   Page admin URL (`linkedin.com/company/<id>/admin/`), or via:
   ```
   GET https://api.linkedin.com/v2/organizationAcls?q=roleAssignee
       (Authorization: Bearer <LINKEDIN_ACCESS_TOKEN>)
   ```

---

## X (Twitter) — `X_*`

> **Cost:** posting needs at least the **Basic tier (~$100/mo)** for meaningful volume; the
> Free tier is capped very low. Confirm your tier before relying on it.

| Env var | Where it comes from |
|---|---|
| `X_API_KEY` / `X_API_SECRET` | App → Keys and tokens → API Key & Secret (consumer keys) |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | App → Keys and tokens → Access Token & Secret |

1. **developer.x.com** → Developer Portal → create a **Project**, then an **App** inside it.
2. App → **User authentication settings** → enable **OAuth 1.0a**, set **App permissions =
   Read and write**, set any callback URL (`https://localhost` is fine for OAuth 1.0a).
3. **Keys and tokens** tab:
   - **API Key / API Key Secret** → `X_API_KEY` / `X_API_SECRET`.
   - **Generate** Access Token & Secret → `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET`.
4. **Critical gotcha:** generate the access token/secret **after** setting permissions to
   *Read and write*. If they were generated while read-only, **regenerate** them or posting
   will 403.

---

## Why Arc doesn't get these keys

Arc holds exactly one credential — `ARC_AGENT_API_TOKEN` — and uses it to
*propose* social posts (draft → approval) and trigger an **approved** dispatch via the API.
The actual post is executed by the control plane with the secrets above. This keeps the
approval gate enforceable ("no page publishing without explicit human approval"), gives one
revocation point and a single audit trail, and keeps secrets off the Arc runtime host.
