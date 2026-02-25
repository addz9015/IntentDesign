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

        // 1. Try to find product by name keywords
        let product = products.find(p => {
            const nameLower = p.name.toLowerCase();
            return lowerMsg.includes(nameLower) || nameLower.split(' ').some(word => word.length > 3 && lowerMsg.includes(word));
        });

        // 2. Fallback to session context if user says "it", "this", "that"
        if (!product && (lowerMsg.includes('it') || lowerMsg.includes('this') || lowerMsg.includes('that')) && session.last_product) {
            product = products.find(p => p.id === session.last_product);
        }

        if (product) {
            session.last_product = product.id;
            return {
                type: 'PRODUCT_QUERY',
                data: product
            };
        }

        return {
            type: 'PRODUCT_QUERY',
            data: null,
            message: "Which product are you interested in?"
        };
    }
}

module.exports = KnowledgeEngine;
