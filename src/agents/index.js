const ProductAgent = require("./productAgent");
const ReminderAgent = require("./reminderAgent");
const ReturnPolicyAgent = require("./returnPolicyAgent");

/**
 * Agent Registry
 * --------------
 * The single list of specialized agents. The router uses this to map a
 * classified intent to its owning agent and to coordinate multi-domain queries.
 *
 * Adding a teammate's module = add one line here (plus the agent file). Nothing
 * else in the system needs to change.
 */
const agents = [new ProductAgent(), new ReturnPolicyAgent(), new ReminderAgent()];

// intent_type -> agent (first registered owner wins)
const intentMap = {};
for (const agent of agents) {
  for (const intent of agent.intents) {
    if (!intentMap[intent]) intentMap[intent] = agent;
  }
}

function getAgentForIntent(intentType) {
  return intentMap[intentType] || null;
}

/** Agents (other than the primary) that opt in to a message via match(). */
function getSecondaryAgents(context, primaryAgent) {
  return agents.filter((a) => a !== primaryAgent && a.match(context));
}

module.exports = {
  agents,
  intentMap,
  getAgentForIntent,
  getSecondaryAgents,
};
