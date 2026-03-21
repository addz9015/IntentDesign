const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = (process.env.SUPABASE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing keys!");
  process.exit(1);
}

// We just print the SQL required for the user to run based on the new multi-tenant architecture.
console.log(`
Please run the following script in your Supabase SQL Editor:

-- 1. App Tenants (Companies/Brands using the engine)
CREATE TABLE app_tenants (
  tenant_id TEXT PRIMARY KEY, -- e.g., 'urbanwear'
  business_name TEXT NOT NULL,
  whatsapp_number TEXT UNIQUE,
  ai_tone TEXT DEFAULT 'friendly',
  currency TEXT DEFAULT '₹',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. App Products (Inventory per tenant)
CREATE TABLE app_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT UNIQUE NOT NULL, -- e.g., 'prod_hoodie123'
  tenant_id TEXT NOT NULL REFERENCES app_tenants(tenant_id),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  material TEXT,
  sizes TEXT[], -- e.g., ARRAY['S', 'M', 'L']
  colors TEXT[], -- e.g., ARRAY['Black', 'Blue']
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Optimized constraint: a tenant can't have duplicate product IDs
  UNIQUE(tenant_id, product_id)
);

-- 3. App Customers (Users chatting per tenant)
CREATE TABLE app_customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id TEXT UNIQUE NOT NULL, 
  tenant_id TEXT NOT NULL REFERENCES app_tenants(tenant_id),
  phone TEXT NOT NULL,
  name TEXT DEFAULT 'New Customer',
  tag TEXT DEFAULT 'new',
  
  total_orders INTEGER DEFAULT 0,
  total_spent_cents INTEGER DEFAULT 0,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  preferred_language TEXT DEFAULT 'en',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Crucial: The same phone number can be a customer for DIFFERENT tenants
  UNIQUE(tenant_id, phone)
);

-- 4. App Payments (Invoices/Dues per customer)
CREATE TABLE app_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id TEXT UNIQUE NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES app_tenants(tenant_id),
  customer_id TEXT NOT NULL REFERENCES app_customers(customer_id),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'cancelled'
  
  last_reminded TIMESTAMPTZ,
  reminder_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
`);
