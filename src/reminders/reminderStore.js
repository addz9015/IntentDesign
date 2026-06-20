const fs = require("fs");
const path = require("path");
const supabase = require("../supabaseClient");

/**
 * ReminderStore
 * -------------
 * Persistence for reminders. Prefers Supabase (table `app_reminders`) so the
 * system scales horizontally and a separate scheduler/worker can read the same
 * data. Falls back to the legacy JSON file (sessions/reminders.json) when the
 * table is unavailable — so reminders keep working before the SQL migration is
 * applied, and existing reminders are not lost.
 *
 * A reminder row:
 *   {
 *     reminder_id, tenant_id (int), customer_id, user_phone,
 *     category ('custom'|'payment'|'service'|'subscription'|'followup'|'purchase'),
 *     task, remind_at (ISO), status ('scheduled'|'delivered'|'failed'|'cancelled'),
 *     payload (object), created_at, delivered_at, error
 *   }
 */

const TABLE = "app_reminders";
const JSON_STORE = path.join(__dirname, "..", "..", "sessions", "reminders.json");

let _useDbCached = null; // memoized capability check per process

async function dbAvailable() {
  if (_useDbCached !== null) return _useDbCached;
  try {
    const { error } = await supabase.from(TABLE).select("reminder_id").limit(1);
    _useDbCached = !error;
    if (error) {
      console.warn(
        `ReminderStore: ${TABLE} not available, using JSON fallback:`,
        error.message,
      );
    }
  } catch (err) {
    _useDbCached = false;
    console.warn("ReminderStore: DB check failed, using JSON fallback:", err.message);
  }
  return _useDbCached;
}

// ---- JSON fallback helpers ----
function loadJson() {
  if (!fs.existsSync(JSON_STORE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(JSON_STORE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("ReminderStore: could not read JSON store:", err.message);
    return [];
  }
}

function saveJson(reminders) {
  const dir = path.dirname(JSON_STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(JSON_STORE, JSON.stringify(reminders, null, 2));
}

const ReminderStore = {
  async create(reminder) {
    if (await dbAvailable()) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert([reminder])
        .select()
        .single();
      if (error) {
        console.warn("ReminderStore.create DB error, falling back to JSON:", error.message);
      } else {
        return data;
      }
    }
    const reminders = loadJson();
    reminders.push(reminder);
    saveJson(reminders);
    return reminder;
  },

  /** Reminders that are scheduled and due at or before `now`. */
  async getDue(now = new Date()) {
    const iso = now.toISOString();
    if (await dbAvailable()) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("status", "scheduled")
        .lte("remind_at", iso);
      if (!error) return data || [];
      console.warn("ReminderStore.getDue DB error, falling back to JSON:", error.message);
    }
    return loadJson().filter(
      (r) => r.status === "scheduled" && new Date(r.remind_at) <= now,
    );
  },

  async updateStatus(reminderId, status, extra = {}) {
    if (await dbAvailable()) {
      const { error } = await supabase
        .from(TABLE)
        .update({ status, ...extra })
        .eq("reminder_id", reminderId);
      if (!error) return true;
      console.warn("ReminderStore.updateStatus DB error, falling back to JSON:", error.message);
    }
    const reminders = loadJson();
    const idx = reminders.findIndex((r) => r.reminder_id === reminderId);
    if (idx === -1) return false;
    reminders[idx] = { ...reminders[idx], status, ...extra };
    saveJson(reminders);
    return true;
  },

  async markDelivered(reminderId) {
    return this.updateStatus(reminderId, "delivered", {
      delivered_at: new Date().toISOString(),
    });
  },

  async markFailed(reminderId, errorMessage) {
    return this.updateStatus(reminderId, "failed", { error: errorMessage });
  },
};

module.exports = ReminderStore;
