const IntentClassifier = require('./intentClassifier');
const TransactionEngine = require('./transactionEngine');
const KnowledgeEngine = require('./knowledgeEngine');
const FallbackEngine = require('./fallbackEngine');
const ResponseGenerator = require('./responseGenerator');
const CustomerService = require('./customerService');

/**
 * Orchestrates the flow based on intent and session state.
 */
async function routeRequest(message, session, config) {
    const tenantId = session.tenant_id;
    const fromNumber = session.session_id;

    // 1. Classify Intent
    const classification = await IntentClassifier.classify(message, session);
    const intent = classification.intent_type;

    // 2. Proactive Customer Check (Teammate Logic)
    // If user is just greeting or asking for help, check if they have dues
    let proactiveData = null;
    if (intent === 'SMALL_TALK' || intent === 'UNKNOWN') {
        const paymentInfo = CustomerService.checkPaymentStatus(tenantId, fromNumber);
        if (paymentInfo.has_due) {
            proactiveData = { type: 'PAYMENT_REMINDER', data: paymentInfo };
        }
    }

    let responseData = null;

    // 3. Route to specific engine
    switch (intent) {
        case 'TRANSACTIONAL':
            responseData = await TransactionEngine.handle(message, session, config);
            // If a transaction was successful, update customer stats
            if (responseData.type === 'TRANSACTION_SUCCESS' && responseData.action === 'ORDER_NEW') {
                CustomerService.updateOrderStats(tenantId, fromNumber);
            }
            break;
        case 'PRODUCT_QUERY':
        case 'FAQ_QUERY':
            responseData = await KnowledgeEngine.handle(message, session, config);
            break;
        case 'SMALL_TALK':
            responseData = { type: 'SMALL_TALK', data: null };
            break;
        default:
            responseData = await FallbackEngine.handle(message, session, config);
    }

    // 4. Merge proactive data if applicable
    if (proactiveData && !responseData.type.includes('TRANSACTION')) {
        responseData.proactive = proactiveData;
    }

    // 5. Generate natural response via AI
    const naturalResponse = await ResponseGenerator.generate(message, responseData, session, config);

    return {
        intent,
        response: naturalResponse,
        session_update: session
    };
}

module.exports = routeRequest;
