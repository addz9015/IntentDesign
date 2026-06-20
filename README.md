# WhatsApp AI Platform

A multi-tenant, AI-powered WhatsApp assistant platform featuring semantic intent classification, session memory, guardrails, and real-time WhatsApp integration.

> **Architecture:** the system routes each message to one of three specialized AI agents — **Product**, **Reminder**, and **Return Policy** — behind a single orchestrator. WhatsApp transport is **Meta Cloud API only** (OpenWA removed). See **[ARCHITECTURE.md](ARCHITECTURE.md)** for agent boundaries, the DB schema, and how to add new modules. Run [scripts/migrations/001_agents_schema.sql](scripts/migrations/001_agents_schema.sql) in Supabase to enable the reminder/return-policy tables.

---

## 🛠 Features

- **Multi-Tenant Architecture**: Isolate data and config for different businesses (e.g., `UrbanWear`).
- **Hybrid Brain**: Combines fast Regex (for local phrases) with Groq LLM (for semantic understanding).
- **Session Memory**: Maintains context across messages (resolves "it", "this", etc.).
- **Proactive Logic**: Automatically checks for payment dues and order stats.
- **Live WhatsApp Integration**: Built-in Express server for Webhooks and Facebook Graph API.
- **Regional Language Adaptation**: Optional AI4Bharat translation pipeline for Indic languages.
- **Hinglish Support**: Detects Hinglish and keeps replies in natural Roman-script Hinglish.
- **Controlled Emojis**: Adds emojis randomly with configurable probability (not on every reply).

---

## 📋 Setup Guide

### 1. Prerequisite

Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Environment Configuration

Copy the template and fill in your own values. **Never commit your real `.env`** — it is gitignored; only `.env.example` (no secrets) is tracked.

```powershell
cp .env.example .env
```

Minimum required keys:

```env
# Groq AI Key (Get it from console.groq.com)
GROQ_API_KEY=your_groq_key_here

# WhatsApp Cloud API (Meta) — the only supported transport
VERIFY_TOKEN=your_custom_verify_token
WHATSAPP_TOKEN=your_meta_access_token
PHONE_NUMBER_ID=your_meta_phone_id
# App Secret → verifies incoming webhooks (X-Hub-Signature-256)
META_APP_SECRET=your_meta_app_secret

# Supabase (products, customers, payments, reminders, return policies)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Tenant resolution (defaults in tenants/registry.json)
DEFAULT_TENANT_ID=1
DEFAULT_TENANT_KEY=urbanwear
```

Optional keys (reminders cadence, emoji probability, AI4Bharat/Hugging Face translation) are documented in **[.env.example](.env.example)**.

### 3. Installation

```powershell
npm install
```

### 4. Database Setup (Supabase)

Apply the schema and seed demo data:

```powershell
# 1. Run the migration (creates app_reminders, app_return_policies, app_returns, etc.)
#    Paste scripts/migrations/001_agents_schema.sql into the Supabase SQL editor,
#    or use the helper:
node scripts/setup_supabase.js

# 2. (Optional) Load demo tenant data
node scripts/seed_data.js
```

> The agents **degrade gracefully** if the new tables aren't applied yet — Return Policy falls back to `tenants/<key>/policies.json` and reminders fall back to a local JSON store. See [ARCHITECTURE.md](ARCHITECTURE.md).

### 5. Running the Platform

#### 🎮 Interactive Demo (CLI)

Test the "brain" locally in your terminal:

```powershell
npm run interactive
```

#### 🌐 Live Server (WhatsApp Webhook)

Start the server to receive real WhatsApp messages:

```powershell
npm run serve
```

_Note: Use a tool like **ngrok** to expose your local port 5000 to the internet._

### 6. Tests

```powershell
npm test        # jest --coverage
```

---

## 🏗 Project Structure

Each message is classified, then routed to one of three specialized agents behind a single orchestrator. See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full request flow and DB schema.

```text
tenants/
  ├── registry.json              # Tenant routing (phone-number-id → tenant)
  └── urbanwear/                 # Per-business config & file fallbacks
      ├── config.json            # Settings (tone, currency, etc.)
      ├── products.json          # Catalog
      ├── customers.json         # Customer records
      ├── faqs.json
      └── policies.json
scripts/
  ├── migrations/001_agents_schema.sql   # Supabase tables for reminders/returns
  ├── setup_supabase.js          # Apply schema / provision tables
  └── seed_data.js               # Load demo tenant data
src/
  ├── server.js                  # Express webhook server (Meta Cloud API)
  ├── index.js                   # Entry: tenant resolve, session, language adapt
  ├── interactive.js             # CLI demo harness
  ├── core/
  │   ├── agentRouter.js         # Orchestrator (routing + multi-domain aggregation)
  │   └── baseAgent.js           # Base class all agents extend
  ├── agents/                    # ProductAgent, ReminderAgent, ReturnPolicyAgent (+ index)
  ├── intentClassifier.js        # Hybrid brain (rules → regex → Groq)
  ├── detector/detectIntent.js   # Regex / rule-based intent detection
  ├── normalizer/normalizeText.js# Text normalization
  ├── knowledgeEngine.js         # Product Q&A / RAG
  ├── transactionEngine.js       # Orders, payments, cancellations (guardrailed)
  ├── reminderEngine.js          # Reminder logic
  ├── reminderScheduler.js       # Background poll for due reminders & payment dues
  ├── reminders/reminderStore.js # Reminder persistence (DB + JSON fallback)
  ├── responseGenerator.js       # Structured result → natural language reply
  ├── languageService.js         # Hinglish / Indic language adaptation
  ├── customerService.js         # CRM & VIP logic
  ├── sessionManager.js          # Per-user session state
  ├── memoryManager.js           # Rolling memory summary
  ├── fallbackEngine.js          # Rule-based safety fallback when AI fails
  ├── tenantResolver.js          # Resolve tenant_id / tenant_key
  ├── services/llmClient.js      # Groq SDK client
  ├── whatsappAdapter.js         # → whatsappService.js (Meta Cloud API connector)
  ├── supabaseClient.js          # Supabase connection
  ├── config/                    # intents.json, intents_config.json, replies.json
  └── utils/                     # fuzzyMatch, confidence, responder, loggers, linter
tests/                           # Jest unit + integration tests
```

> **Not committed (gitignored):** `node_modules/`, `coverage/`, `.env`, and runtime state (`sessions/`, `logs/`, scratch `test_*.txt`). These are regenerated at install/runtime and must never be pushed.

---

## 🛡 Guardrails

- **Transactional Confirmation**: Cancellations and refunds require a high-confidence "Yes" from the user before executing.
- **Safety Fallback**: If the AI API fails, the bot automatically switches to rule-based logic to maintain stability.
