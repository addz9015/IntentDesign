const fs = require('fs');
const path = require('path');

const REMINDER_STORE = path.join(__dirname, '..', 'sessions', 'reminders.json');

function loadReminders() {
    if (!fs.existsSync(REMINDER_STORE)) {
        return [];
    }

    try {
        const raw = fs.readFileSync(REMINDER_STORE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Could not read reminder store:', error.message);
        return [];
    }
}

function saveReminders(reminders) {
    const dir = path.dirname(REMINDER_STORE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(REMINDER_STORE, JSON.stringify(reminders, null, 2));
}

function formatReminderTime(date) {
    return new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
}

function parseDuration(text) {
    const lower = String(text || '').toLowerCase();

    const relativeMatch = lower.match(/(?:in|after)\s+(\d+)\s*(minute|minutes|hour|hours|day|days)/i);
    if (relativeMatch) {
        const value = Number(relativeMatch[1]);
        const unit = relativeMatch[2];
        if (Number.isFinite(value) && value > 0) {
            const date = new Date();
            if (unit.startsWith('minute')) date.setMinutes(date.getMinutes() + value);
            if (unit.startsWith('hour')) date.setHours(date.getHours() + value);
            if (unit.startsWith('day')) date.setDate(date.getDate() + value);
            return { remindAt: date, matchedText: relativeMatch[0] };
        }
    }

    const tomorrowMatch = lower.match(/tomorrow(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (tomorrowMatch) {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setSeconds(0, 0);

        const hour = tomorrowMatch[1] ? Number(tomorrowMatch[1]) : 9;
        const minutes = tomorrowMatch[2] ? Number(tomorrowMatch[2]) : 0;
        const meridian = tomorrowMatch[3] ? tomorrowMatch[3].toLowerCase() : 'am';

        let adjustedHour = hour % 12;
        if (meridian === 'pm') adjustedHour += 12;
        if (meridian === 'am' && hour === 12) adjustedHour = 0;

        date.setHours(adjustedHour, minutes, 0, 0);
        return { remindAt: date, matchedText: tomorrowMatch[0] };
    }

    const absoluteMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (absoluteMatch && /remind/i.test(lower)) {
        const date = new Date();
        const hour = Number(absoluteMatch[1]);
        const minutes = absoluteMatch[2] ? Number(absoluteMatch[2]) : 0;
        const meridian = absoluteMatch[3] ? absoluteMatch[3].toLowerCase() : null;

        let adjustedHour = hour;
        if (meridian) {
            adjustedHour = hour % 12;
            if (meridian === 'pm') adjustedHour += 12;
            if (meridian === 'am' && hour === 12) adjustedHour = 0;
        }

        date.setHours(adjustedHour, minutes, 0, 0);
        if (date <= new Date()) {
            date.setDate(date.getDate() + 1);
        }
        return { remindAt: date, matchedText: absoluteMatch[0] };
    }

    return null;
}

function extractReminderTask(text, matchedText) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;

    const normalized = matchedText ? cleanText.replace(matchedText, '').trim() : cleanText;

    const taskPatterns = [
        /remind me to (.+?)(?:\s+(?:in|after)\s+\d+\s*(?:minute|minutes|hour|hours|day|days)|\s+tomorrow(?:\s+at\s+.+)?|\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|$)/i,
        /remind me (?:in|after) \d+\s*(?:minute|minutes|hour|hours|day|days) to (.+?)(?:$|\s+tomorrow|\s+at\s+\d{1,2})/i,
        /follow up with me (?:to )?(.+?)(?:$|\s+in\s+\d+|\s+tomorrow|\s+at\s+\d{1,2})/i,
    ];

    for (const pattern of taskPatterns) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
            return match[1].trim().replace(/[.?!]+$/, '');
        }
    }

    if (normalized && /remind/i.test(cleanText)) {
        return normalized.replace(/^remind me/i, '').trim().replace(/^to\s+/i, '').replace(/[.?!]+$/, '') || 'follow up';
    }

    return null;
}

class ReminderEngine {
    static parseReminder(message) {
        const lower = String(message || '').toLowerCase();
        if (!/\b(remind|reminder|follow up|follow-up|ping me)\b/i.test(lower)) {
            return null;
        }

        const duration = parseDuration(message);
        const task = extractReminderTask(message, duration?.matchedText);

        if (!duration || !duration.remindAt || !task) {
            return null;
        }

        return {
            task,
            remindAt: duration.remindAt,
            matchedText: duration.matchedText
        };
    }

    static async handle(message, session, config) {
        const parsed = this.parseReminder(message);
        if (!parsed) return null;

        const reminders = loadReminders();
        const reminderId = `rem_${Math.random().toString(16).slice(2, 10)}`;
        const reminder = {
            reminder_id: reminderId,
            tenant_id: session.tenant_id,
            user_id: session.session_id,
            user_phone: session.session_id,
            task: parsed.task,
            remind_at: parsed.remindAt.toISOString(),
            status: 'scheduled',
            created_at: new Date().toISOString(),
            source_message: message
        };

        reminders.push(reminder);
        saveReminders(reminders);

        const formattedTime = formatReminderTime(parsed.remindAt);
        const reviewLink = config?.review_link ? `\nPlease share your review here: ${config.review_link}` : '';

        return {
            type: 'REMINDER_SET',
            data: reminder,
            message: `Okay, I will remind you on ${formattedTime} about ${parsed.task}.`,
            follow_up: `Are you also interested in buying something today?${reviewLink}`
        };
    }

    static getDueReminders(now = new Date()) {
        const reminders = loadReminders();
        return reminders.filter((reminder) => {
            return reminder.status === 'scheduled' && new Date(reminder.remind_at) <= now;
        });
    }

    static markDelivered(reminderId) {
        const reminders = loadReminders();
        const index = reminders.findIndex((item) => item.reminder_id === reminderId);
        if (index === -1) return false;

        reminders[index].status = 'delivered';
        reminders[index].delivered_at = new Date().toISOString();
        saveReminders(reminders);
        return true;
    }

    static markFailed(reminderId, errorMessage) {
        const reminders = loadReminders();
        const index = reminders.findIndex((item) => item.reminder_id === reminderId);
        if (index === -1) return false;

        reminders[index].status = 'failed';
        reminders[index].error = errorMessage;
        saveReminders(reminders);
        return true;
    }

    static buildReminderText(reminder) {
        const task = reminder.task || 'your reminder';
        return `Reminder: ${task}. I can also help you with products, prices, orders, payments, and reviews.`;
    }
}

module.exports = ReminderEngine;
