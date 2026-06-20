const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');

/**
 * Knowledge Engine (RAG)
 * Retrieves product info and FAQ answers.
 */
class KnowledgeEngine {
    static async handle(message, session, config) {
        const tenantId = session.tenant_id;

        if (session.last_intent === 'FAQ_QUERY' || message.toLowerCase().includes('delivery') || message.toLowerCase().includes('return')) {
            // Clear last product context when switching to non-product topics
            session.last_product = null;
            return this.handleFAQ(message, session.tenant_key || 'urbanwear');
        }

        return await this.handleProductQuery(message, session, tenantId);
    }

    static handleFAQ(message, tenantKey) {
        // FAQs can stay in JSON for now, or move to Supabase later.
        // NOTE: read by string tenant_key (folder name), NOT the integer db id.
        const faqs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tenants', tenantKey, 'faqs.json'), 'utf8'));
        // Simulating AI matching FAQ
        const faq = faqs.find(f => message.toLowerCase().includes(f.question.toLowerCase().split(' ')[0]));
        return {
            type: 'FAQ_QUERY',
            data: faq || { answer: "I'm not sure about that. Let me log this for our team." }
        };
    }

    static async handleProductQuery(message, session, tenantId) {
        const { data: products, error } = await supabase
            .from('app_products')
            .select('*')
            .eq('tenant_id', tenantId);

        if (error || !products || products.length === 0) {
            console.error('Error fetching products from Supabase:', error);
            return {
                type: 'PRODUCT_QUERY',
                data: null,
                message: "Which product are you interested in?",
                products: []
            };
        }

        const lowerMsg = message.toLowerCase();
        if (!session.rejected_products) session.rejected_products = [];
        if (!session.rejected_product_names) session.rejected_product_names = [];

        const wantsAlternatives = /(kuch\s+aur|aur\s+dikhao|some\s+other|other\s+products|another\s+product|something\s+else|show\s+more)/i.test(lowerMsg);
        const isNegotiating = /(discount|best\s+price|lower|kam\s+kar|sasta|cheap|thoda\s+kam|kam\s+price|final\s+price|last\s+price|offer|deal|can\s+you\s+do|lowest|more\s+discount|thora\s+kam)/i.test(lowerMsg);

        // Build a set of aliases per product for fuzzy matching
        function getAliases(name) {
            return name.toLowerCase()
                .split(' ')
                .filter(w => w.length > 3);
        }

        // 0. Rejection detection — "no hoodie", "not that", "nahi classic hoodie", bare "no"
        //    Must run BEFORE keyword match so "no classic hoodie" isn't treated as a query
        if (!session.browsing_declined_count) session.browsing_declined_count = 0;
        const isRejecting = /^(no|nope|nahi|not|dont|don't|na)\b/i.test(lowerMsg.trim());
        if (isRejecting) {
            // Find which product the user is rejecting (by keyword or last_product)
            let rejectedProduct = products.find(p => {
                const aliases = getAliases(p.name);
                return aliases.some(alias => lowerMsg.includes(alias));
            });
            if (!rejectedProduct && session.last_product) {
                rejectedProduct = products.find(p => p.product_id === session.last_product);
            }
            if (rejectedProduct) {
                // Specific product rejection
                if (!session.rejected_products.includes(rejectedProduct.product_id)) {
                    session.rejected_products.push(rejectedProduct.product_id);
                    session.rejected_product_names.push(rejectedProduct.name);
                }
                if (session.last_product === rejectedProduct.product_id) {
                    session.last_product = null;
                    session.last_product_name = null;
                }
                const available = products.filter(p => !session.rejected_products.includes(p.product_id));
                return {
                    type: 'PRODUCT_QUERY',
                    data: null,
                    message: `User rejected ${rejectedProduct.name} — do NOT mention or suggest it again.`,
                    products: available.map(p => ({ name: p.name, id: p.product_id }))
                };
            } else {
                // General rejection — user doesn't want any of the suggestions
                session.browsing_declined_count++;
                session.last_product = null;
                session.last_product_name = null;
                if (session.browsing_declined_count >= 2) {
                    return {
                        type: 'BROWSING_DECLINED',
                        message: 'User does not want to browse any more products. Acknowledge politely and say you are here whenever they need help. Do NOT suggest any products.'
                    };
                }
                return {
                    type: 'BROWSING_DECLINED',
                    message: 'User declined the current product suggestions. Ask briefly what they need help with — do NOT list products again.'
                };
            }
        }

        // Reset browsing decline count when user actively searches for a product
        session.browsing_declined_count = 0;

        // Only consider products the user hasn't rejected
        const activeProducts = products.filter(p => !session.rejected_products.includes(p.product_id));

        // 0b. Browse alternatives flow (fixes repeated suggestion of current product)
        if (wantsAlternatives) {
            const alternatives = activeProducts.filter(p => p.product_id !== session.last_product);
            const list = alternatives.length > 0 ? alternatives : activeProducts;

            session.last_product = null;
            session.last_product_name = null;

            return {
                type: 'ALTERNATIVE_PRODUCTS',
                data: null,
                message: 'User asked for other products. Show 2-3 different options and ask which one they want details for.',
                products: list.map(p => ({ name: p.name, id: p.product_id }))
            };
        }

        // 1. Try to find product by keyword match
        let product = activeProducts.find(p => {
            const aliases = getAliases(p.name);
            return aliases.some(alias => lowerMsg.includes(alias));
        });

        // 2. Fallback to last discussed product (follow-up questions like "and in what sizes",
        //    "how much does it cost", "what colors", etc. — no pronoun required)
        if (!product && session.last_product) {
            product = activeProducts.find(p => p.product_id === session.last_product);
        }

        // 2b. Negotiation flow for current product context
        if (isNegotiating && product) {
            const maxDiscountPercent = session.negotiation_attempts >= 2 ? 0.05 : 0.10;
            const minPriceCents = Math.round(product.price_cents * (1 - maxDiscountPercent));
            const parsedNumbers = (lowerMsg.match(/\d+/g) || []).map(Number).filter(Boolean);
            let requestedPriceCents = null;

            if (parsedNumbers.length > 0) {
                // Treat 3+ digit values as rupees and convert to cents
                const requestedRupees = Math.max(...parsedNumbers);
                if (requestedRupees >= 100) {
                    requestedPriceCents = requestedRupees * 100;
                }
            }

            const negotiatedPriceCents = session.negotiated_price_cents && session.negotiation_attempts >= 2
                ? session.negotiated_price_cents
                : requestedPriceCents
                    ? Math.max(requestedPriceCents, minPriceCents)
                    : minPriceCents;

            session.negotiated_product_id = product.product_id;
            session.negotiated_price_cents = negotiatedPriceCents;
            session.negotiation_attempts = (session.negotiation_attempts || 0) + 1;
            session.last_product = product.product_id;
            session.last_product_name = product.name;

            const formattedProduct = {
                id: product.product_id,
                name: product.name,
                price: product.price_cents / 100,
                material: product.material,
                sizes: product.sizes,
                colors: product.colors
            };

            return {
                type: 'NEGOTIATION_OFFER',
                data: {
                    ...formattedProduct,
                    original_price: product.price_cents / 100,
                    offered_price: negotiatedPriceCents / 100
                },
                message: session.negotiation_attempts >= 2
                    ? 'User is negotiating price again. This is the final offer. Share the best offer clearly and ask if they want to place the order at that price.'
                    : 'User is negotiating price. Acknowledge, share the best offer, and ask if they want to place the order at that price.',
                products: activeProducts.map(p => ({ name: p.name, id: p.product_id }))
            };
        }

        if (product) {
            // Reset collected order info when switching to a different product
            if (product.product_id !== session.last_product) {
                session.order_size = null;
                session.order_color = null;
                session.negotiated_product_id = null;
                session.negotiated_price_cents = null;
                session.negotiation_attempts = 0;
            }
            session.last_product = product.product_id;
            session.last_product_name = product.name;

            // Format for ResponseGenerator compatibility
            const formattedProduct = {
                id: product.product_id,
                name: product.name,
                price: product.price_cents / 100, // Convert back to currency
                material: product.material,
                sizes: product.sizes,
                colors: product.colors
            };

            return {
                type: 'PRODUCT_QUERY',
                data: formattedProduct,
                products: activeProducts.map(p => ({ name: p.name, id: p.product_id }))
            };
        } else {
            session.last_product = null;
            session.last_product_name = null;
            session.negotiated_product_id = null;
            session.negotiated_price_cents = null;
            session.negotiation_attempts = 0;
        }

        return {
            type: 'PRODUCT_QUERY',
            data: null,
            message: "Which product are you interested in?",
            products: activeProducts.map(p => ({ name: p.name, id: p.product_id }))
        };
    }
}

module.exports = KnowledgeEngine;
