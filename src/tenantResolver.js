const path = require("path");
const fs = require("fs");

/**
 * Tenant Resolver
 * ---------------
 * IMPORTANT distinction (this was a live bug before):
 *   - `db_tenant_id` is an INTEGER and is what every Supabase query must use
 *     (the live `app_*` tables key on an integer tenant_id, e.g. 1).
 *   - `tenant_key` is a STRING folder name under tenants/<key>/ used to load
 *     file-based config (tone, currency, faqs, policies fallback).
 *
 * Previously the code resolved everyone to the string "urbanwear" and queried
 * Supabase with it, so `.eq('tenant_id', 'urbanwear')` matched zero rows.
 *
 * Resolution is driven by tenants/registry.json so new businesses can be added
 * declaratively, and can later be resolved by incoming WhatsApp phone number id
 * instead of a global default — without touching the agents.
 */

const REGISTRY_PATH = path.join(__dirname, "..", "tenants", "registry.json");

let _registry = null;
function loadRegistry() {
  if (_registry) return _registry;
  try {
    _registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch (err) {
    console.warn(
      "⚠️ Could not read tenants/registry.json, using built-in default:",
      err.message,
    );
    _registry = {
      default_key: "urbanwear",
      tenants: [{ key: "urbanwear", db_tenant_id: 1 }],
    };
  }
  return _registry;
}

function defaultKey() {
  return process.env.DEFAULT_TENANT_KEY || loadRegistry().default_key || "urbanwear";
}

/** Find a tenant entry by its string key. */
function getTenantEntryByKey(key) {
  const reg = loadRegistry();
  return (reg.tenants || []).find((t) => t.key === key) || null;
}

/**
 * Resolve the incoming WhatsApp sender to a tenant.
 *
 * For now this returns the default tenant (single-business setup). The hook for
 * true multi-tenant routing is here: match on the WhatsApp phone number id the
 * message arrived on, or a DB lookup. Returns the full tenant context object.
 */
function resolveTenantContext(/* fromNumber, phoneNumberId */) {
  const key = defaultKey();
  const entry = getTenantEntryByKey(key) || { key, db_tenant_id: 1 };
  const dbId = Number(
    process.env.DEFAULT_TENANT_ID != null
      ? process.env.DEFAULT_TENANT_ID
      : entry.db_tenant_id != null
        ? entry.db_tenant_id
        : 1,
  );
  return { tenant_key: key, tenant_id: dbId };
}

/**
 * Backwards-compatible: returns the INTEGER db tenant id used for Supabase.
 * (Older callers used the return value of resolveTenant() directly in queries.)
 */
function resolveTenant(fromNumber) {
  return resolveTenantContext(fromNumber).tenant_id;
}

/** Returns the STRING tenant key used for file-based config lookups. */
function resolveTenantKey(fromNumber) {
  return resolveTenantContext(fromNumber).tenant_key;
}

/**
 * Load merged config for a tenant. Accepts EITHER the integer db tenant id OR
 * the string tenant key, so existing callers (some pass tenant_id) keep working.
 */
function getTenantConfig(tenantRef) {
  let key;
  if (typeof tenantRef === "number" || /^\d+$/.test(String(tenantRef))) {
    // Given an integer db id → map back to a key via the registry.
    const reg = loadRegistry();
    const entry = (reg.tenants || []).find(
      (t) => Number(t.db_tenant_id) === Number(tenantRef),
    );
    key = entry ? entry.key : defaultKey();
  } else {
    key = tenantRef || defaultKey();
  }

  const configPath = path.join(__dirname, "..", "tenants", key, "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Tenant config for "${key}" not found at ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!config.review_link && process.env.REVIEW_LINK) {
    config.review_link = process.env.REVIEW_LINK;
  }
  // Expose resolved ids on the config for convenience.
  const entry = getTenantEntryByKey(key);
  config.tenant_key = key;
  config.tenant_id = entry ? Number(entry.db_tenant_id) : Number(process.env.DEFAULT_TENANT_ID || 1);
  return config;
}

/** List all configured tenants as { key, db_tenant_id }. Used by the scheduler. */
function listTenants() {
  const reg = loadRegistry();
  return (reg.tenants || []).map((t) => ({
    key: t.key,
    db_tenant_id: Number(t.db_tenant_id),
  }));
}

module.exports = {
  resolveTenant,
  resolveTenantKey,
  resolveTenantContext,
  getTenantConfig,
  getTenantEntryByKey,
  listTenants,
};
