const path = require('path');
const fs = require('fs');

/**
 * Maps incoming WhatsApp identification (number) to a tenant ID.
 * In production, this would be a DB lookup.
 */
function resolveTenant(fromNumber) {
    // For prototype, we map everyone to 'urbanwear'
    // or we can simulate based on prefix etc.
    return 'urbanwear';
}

function getTenantConfig(tenantId) {
    const configPath = path.join(__dirname, '..', 'tenants', tenantId, 'config.json');
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    throw new Error(`Tenant ${tenantId} not found`);
}

module.exports = { resolveTenant, getTenantConfig };
