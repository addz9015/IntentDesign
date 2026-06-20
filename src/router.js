/**
 * Compatibility shim.
 * The routing logic now lives in core/agentRouter.js (agent-based orchestrator).
 * This re-export keeps older imports of "./router" working.
 */
module.exports = require("./core/agentRouter");
