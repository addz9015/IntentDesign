require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = (process.env.SUPABASE_KEY || process.env['SUPABASE_KEY '] || '').trim();

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ Warning: Missing Supabase credentials in .env. Supabase integration will fail.");
}

const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder'
);

module.exports = supabase;
