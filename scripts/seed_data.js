const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = (process.env.SUPABASE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing keys!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedData() {
    console.log("Seeding initial data into Supabase...");

    const tenantId = 'urbanwear';

    // 1. Seed Tenant
    const { error: tError } = await supabase
        .from('app_tenants')
        .upsert([
            {
                tenant_id: tenantId,
                business_name: 'UrbanWear',
                ai_tone: 'friendly',
                currency: '₹',
                active: true
            }
        ], { onConflict: 'tenant_id' });

    if (tError) {
        console.error("Error seeding tenant:", tError);
    } else {
        console.log(`✅ Seeded tenant: ${tenantId}`);
    }

    // 2. Read existing products from JSON and seed them
    const productsPath = path.join(__dirname, '..', 'tenants', tenantId, 'products.json');
    if (fs.existsSync(productsPath)) {
        const rawProducts = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

        const productsToInsert = rawProducts.map(p => ({
            product_id: p.id,
            tenant_id: tenantId,
            name: p.name,
            price_cents: p.price * 100, // Convert Rs to Cents
            material: p.material || null,
            sizes: p.sizes || [],
            colors: p.colors || [],
            in_stock: true
        }));

        const { error: pError } = await supabase
            .from('app_products')
            .upsert(productsToInsert, { onConflict: 'product_id' });

        if (pError) {
            console.error("Error seeding products:", pError);
        } else {
            console.log(`✅ Seeded ${productsToInsert.length} products for ${tenantId}`);
        }
    } else {
        console.log(`No products.json found for ${tenantId}. Inserting dummy data...`);
        const dummyProduct = {
            product_id: 'prod_hoodie123',
            tenant_id: tenantId,
            name: 'Classic Urban Hoodie',
            price_cents: 199900,
            material: '100% Cotton',
            sizes: ['S', 'M', 'L', 'XL'],
            colors: ['Black', 'Grey', 'Blue'],
            in_stock: true
        };
        const { error: pError } = await supabase
            .from('app_products')
            .upsert([dummyProduct], { onConflict: 'product_id' });

        if (pError) {
            console.error("Error seeding dummy product:", pError);
        } else {
            console.log(`✅ Seeded dummy product for ${tenantId}`);
        }
    }
}

seedData();
