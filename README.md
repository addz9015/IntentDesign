# 🚀 Antigravity AI - WhatsApp AI Platform

A multi-tenant, AI-powered WhatsApp assistant platform featuring semantic intent classification, session memory, guardrails, and real-time WhatsApp integration.

---

## 🛠 Features

- **Multi-Tenant Architecture**: Isolate data and config for different businesses (e.g., `UrbanWear`).
- **Hybrid Brain**: Combines fast Regex (for local phrases) with Groq LLM (for semantic understanding).
- **Session Memory**: Maintains context across messages (resolves "it", "this", etc.).
- **Proactive Logic**: Automatically checks for payment dues and order stats.
- **Live WhatsApp Integration**: Built-in Express server for Webhooks and Facebook Graph API.

---

## 📋 Setup Guide

### 1. Prerequisite
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Environment Configuration
Create a `.env` file in the root directory and fill in the following:

```env
# Groq AI Key (Get it from console.groq.com)
GROQ_API_KEY=your_groq_key_here

# WhatsApp Webhook Verification Token (Your choice)
VERIFY_TOKEN=your_custom_verify_token

# WhatsApp Cloud API Credentials
WHATSAPP_TOKEN=your_meta_access_token
PHONE_NUMBER_ID=your_meta_phone_id
```

### 3. Installation
```powershell
npm install
```

### 4. Running the Platform

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
*Note: Use a tool like **ngrok** to expose your local port 5000 to the internet.*

---

## 🏗 Project Structure

```text
tenants/
  └── urbanwear/         # Business-specific data
      ├── config.json    # Settings (tone, currency, etc)
      ├── products.json  # Catalog for RAG
      └── customers.json # Database (Auto-updated)
src/
  ├── server.js          # Express Webhook Server
  ├── router.js          # Core Orchestrator
  ├── intentClassifier.js# Hybrid AI Brain
  ├── customerService.js # CRM & VIP Logic
  └── whatsappService.js # API Connector
```

---

## 🛡 Guardrails
- **Transactional Confirmation**: Cancellations and refunds require a high-confidence "Yes" from the user before executing.
- **Safety Fallback**: If the AI API fails, the bot automatically switches to rule-based logic to maintain stability.