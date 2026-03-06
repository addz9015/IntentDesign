const fs = require('fs');
const path = require('path');

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
            return this.handleFAQ(message, tenantId);
        }

        return this.handleProductQuery(message, session, tenantId);
    }

    static handleFAQ(message, tenantId) {
        const faqs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tenants', tenantId, 'faqs.json'), 'utf8'));
        // Simulating AI matching FAQ
        const faq = faqs.find(f => message.toLowerCase().includes(f.question.toLowerCase().split(' ')[0]));
        return {
            type: 'FAQ_QUERY',
            data: faq || { answer: "I'm not sure about that. Let me log this for our team." }
        };
    }

    static handleProductQuery(message, session, tenantId) {
        const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tenants', tenantId, 'products.json'), 'utf8'));
        const lowerMsg = message.toLowerCase();

        // Build a set of aliases per product for fuzzy matching
        function getAliases(name) {
            return name.toLowerCase()
                .split(' ')
                .filter(w => w.length > 3);
        }

        // 1. Try to find product by keyword match (incl. partial word match for typos)
        let product = products.find(p => {
            const aliases = getAliases(p.name);
            return aliases.some(alias => lowerMsg.includes(alias));
        });

        // 2. Fallback to session context if user uses pronouns ("it", "this", "that")
        if (!product && (lowerMsg.includes('it') || lowerMsg.includes('this') || lowerMsg.includes('that') || lowerMsg.includes('one')) && session.last_product) {
            product = products.find(p => p.id === session.last_product);
        }

        // 3. Fallback: scan memory summary for product mentions
        if (!product && session.memory_summary) {
            const summary = session.memory_summary.toLowerCase();
            product = products.find(p => {
                const aliases = getAliases(p.name);
                return aliases.some(alias => summary.includes(alias));
            });
        }

        if (product) {
            session.last_product = product.id;
            return {
                type: 'PRODUCT_QUERY',
                data: product,
                products: products
            };
        } else {
            session.last_product = null;
        }

        return {
            type: 'PRODUCT_QUERY',
            data: null,
            message: "Which product are you interested in?",
            products: products
        };
    }
}

module.exports = KnowledgeEngine;
