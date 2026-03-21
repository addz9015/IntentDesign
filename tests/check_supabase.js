require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Fix key if it has spaces
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env['SUPABASE_KEY '];

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing keys!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey.trim());

async function checkTables() {
    console.log("Checking for 'customers' table...");
    const { data: cData, error: cError } = await supabase.from('customers').select('*').limit(1);
    if (cError) {
        console.error("Error accessing 'customers':", cError.message);
    } else {
        console.log("'customers' table exists! Columns might be:", cData.length > 0 ? Object.keys(cData[0]) : "table empty but exists");
    }

    console.log("\nChecking for 'payments' table...");
    const { data: pData, error: pError } = await supabase.from('payments').select('*').limit(1);
    if (pError) {
        console.error("Error accessing 'payments':", pError.message);
    } else {
        console.log("'payments' table exists! Columns might be:", pData.length > 0 ? Object.keys(pData[0]) : "table empty but exists");
    }

    // Let's also check if they created tables with different names? 
    // Maybe "Users" or "Orders" ?
}

checkTables();
