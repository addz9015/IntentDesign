# Architecture — WhatsApp AI Agent Platform

A multi-tenant WhatsApp assistant built on **Meta's WhatsApp Cloud API**, **Supabase**, and **Groq**. Customer messages are classified and routed to one of three specialized AI agents behind a single orchestrator.

> WhatsApp transport is **Meta Cloud API only**. The previous OpenWA (browser-automation) path has been removed.

---

## Request flow

```
Meta Webhook
  → src/server.js            (verify signature, parse, handle button replies)
  → src/index.js             (tenant resolve, session, language adapt)
  → src/core/agentRouter.js  (orchestrator)
        ├─ reminder pre-pass (active negotiation / "remind me ...")
        ├─ IntentClassifier  → intent_type
        ├─ dispatch to the owning AGENT
        └─ multi-domain: also run secondary agents that match(), aggregate
  → src/responseGenerator.js (structured result → natural language, language rule, emoji)
  → src/whatsappAdapter.js   → src/whatsappService.js (Meta Cloud API)

Background: src/reminderScheduler.js polls for due reminders + payment dues.
```

## The three agents

All agents extend [`src/core/baseAgent.js`](src/core/baseAgent.js) and live in [`src/agents/`](src/agents/). The router maps a classified intent to its owning agent via [`src/agents/index.js`](src/agents/index.js).

| Agent | Intents owned | Responsibility | Backed by |
|---|---|---|---|
| **ProductAgent** | `PRODUCT_QUERY`, `FAQ_QUERY`, `TRANSACTIONAL` | Product Q&A, recommendations, availability, ordering/payment/cancellation (with guardrails) | `knowledgeEngine.js` + `transactionEngine.js` (Supabase `app_products`, `app_payments`) |
| **ReturnPolicyAgent** | `RETURN_POLICY` | Explains return policy; evaluates return/refund **eligibility** from DB rules (purchase date, return window, category) | `app_return_policies` + `app_payments` (file fallback) |
| **ReminderAgent** | `REMINDER` | Reactive "remind me…" reminders + proactive, staged payment reminders & negotiation (ported from the teammate's `main.py`) | `app_reminders` + `app_payments` (JSON fallback) |

`SMALL_TALK` and `UNKNOWN` are handled inline by the router (small-talk reply / fallback logging).

## Routing & multi-domain

1. **Reminder pre-pass** — if the customer is mid payment-negotiation (`session.active_payment_reminder`) or types a reactive reminder, the ReminderAgent handles it first.
2. **Classification** — `IntentClassifier` (rules → local regex → Groq) returns an `intent_type`.
3. **Primary dispatch** — the owning agent's `handle()` runs.
4. **Multi-domain** — any other agent whose `match()` returns true also runs; replies are aggregated into one WhatsApp message (e.g. *"can I return this and what's the price?"*).

## Tenancy (important)

- `tenant_id` is an **INTEGER** (db key, e.g. `1`) used for all Supabase queries.
- `tenant_key` is a **STRING** (folder name under `tenants/`, e.g. `urbanwear`) used for file config.
- Resolution is driven by [`tenants/registry.json`](tenants/registry.json) via [`src/tenantResolver.js`](src/tenantResolver.js). The hook for true multi-tenant routing (match on the WhatsApp phone-number-id a message arrived on) is in `resolveTenantContext()`.

> Prior bug: everything resolved to the string `'urbanwear'` and queried Supabase with it, so `.eq('tenant_id', 'urbanwear')` matched zero rows. Now fixed.

## Database

Existing: `app_tenants`, `app_products`, `app_customers`, `app_payments`, `orders`, `product_images`.
New (run [`scripts/migrations/001_agents_schema.sql`](scripts/migrations/001_agents_schema.sql)): `app_return_policies`, `app_reminders`, `app_returns`, plus an optional `app_products.category` column.

The agents **degrade gracefully** if the new tables aren't applied yet (Return Policy falls back to `tenants/<key>/policies.json`; reminders fall back to `sessions/reminders.json`).

---

## How a teammate adds a new module/agent

No router, server, or other-agent changes needed:

1. Create `src/agents/myAgent.js` extending `BaseAgent`; set `intents` and implement `handle(context)`.
2. If it introduces a new intent, add a detection rule in `src/intentClassifier.js` (and to `allowedIntents`).
3. Register it in `src/agents/index.js` (one line).
4. Add any response shape handling in `src/responseGenerator.js` (or return a `message` and rely on the default case).

`context = { message, session, config, options, intentType }`. Return the same structured shape the engines use (`{ type, data, message, ... }`) — `null` to decline.

---

## Scaling notes (where to go next)

These are **designed-for** but not flipped on in this pass (single-instance is fine today):

- **Session state** is currently JSON files (`src/sessionManager.js`). Move to Supabase/Redis to run multiple stateless instances behind a load balancer.
- **Reminder scheduler** runs in-process (`setInterval`). For horizontal scale, move it to a dedicated worker/cron and add a row claim (`FOR UPDATE SKIP LOCKED` or a status flip) so instances don't double-send. Data already lives in Supabase, so no agent changes are required.
- **Per-business agents at scale**: keep agents as in-process modules in one multi-tenant service — **not** a separate deployed service per agent per business. Specialization is logical, deployment is shared.

## Security checklist

- [ ] **Rotate the secrets** that were committed in `.env` (Groq key, Meta `WHATSAPP_TOKEN`, Supabase key) and never commit `.env` (now gitignored).
- [ ] Set `META_APP_SECRET` to enable webhook signature verification (`X-Hub-Signature-256`).
- [ ] Use a Supabase **service-role key only server-side**, and enable **Row Level Security** with per-tenant policies before going multi-tenant.
