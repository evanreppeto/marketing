# Marketing CRM + AI Feature Patterns

This document captures feature ideas from popular CRM, marketing automation, and AI-agent products that Signal can model without becoming overwhelming.

Signal should not copy these tools feature-for-feature. The goal is to borrow the clearest patterns and adapt them to Big Shoulders Restoration: water/fire/mold/sewage restoration work, partner referrals, persona intelligence, campaign creation, and human approval before outbound marketing.

## Product Direction

Signal should feel like:

> CRM + customer intelligence + campaign studio + agent work queue + approval guardrails.

The user experience should stay simple:

- Tell the user what needs attention now.
- Recommend one next action.
- Keep deeper reasoning behind "View details" or "Open audit trail."
- Keep campaign generation coverage-neutral and restoration-focused.
- Never let AI publish, send, or promise insurance outcomes without approval.

## Reference Products

### HubSpot Breeze

Official reference: [HubSpot Breeze AI](https://www.hubspot.com/products/artificial-intelligence)

Pattern to borrow:

- AI embedded inside CRM workflows, not isolated in a separate lab.
- AI assistants and agents help with customer context, content, research, and operational work.
- CRM records become the source of truth for AI-assisted actions.

Signal adaptation:

- Add small "AI can help" actions inside CRM records, reports, personas, and lead routing.
- Use record data to draft campaign briefs, outreach, one-pagers, and referral scripts.
- Keep the main page simple, with AI suggestions appearing only where they help the current workflow.

Feature ideas:

- "Summarize this contact"
- "Draft next message"
- "Find missing fields"
- "Create partner campaign from this segment"
- "Explain why this lead is prioritized"

### Salesforce Agentforce / Einstein

Official reference: [Salesforce Agentforce](https://www.salesforce.com/agentforce/)

Pattern to borrow:

- AI agents operate inside CRM workflows with clear grounding, permissions, and guardrails.
- Agent work is tied to business objects and customer records.
- Trust, auditability, and limits are product features, not afterthoughts.

Signal adaptation:

- Treat agents like visible coworkers with queues, task status, linked records, and audit trails.
- Agents can draft, investigate, recommend, and validate.
- Humans approve anything that affects customers, campaigns, or outbound communication.

Feature ideas:

- Agent task queue
- Approval inbox
- "Why this was blocked" explanation
- Agent activity feed
- Compliance review before asset approval
- Ground every agent output to CRM/persona/campaign records

### Klaviyo

Official reference: [Klaviyo features](https://www.klaviyo.com/features)

Pattern to borrow:

- Customer intelligence powers segmentation, personalization, and marketing recommendations.
- Predictive signals inform who should get what message next.
- Campaigns are tied to behavior, audience, and revenue outcomes.

Signal adaptation:

- Use persona snapshots to decide what each customer or partner needs next.
- Segment restoration audiences by role, urgency, relationship, loss type, and blocker.
- Feed persona intelligence into Campaign Studio.

Feature ideas:

- Persona Snapshot panel
- "Ready to convert" queue
- "Needs proof" audience lane
- Partner-candidate detection
- Message recommendation by persona
- Campaign content needs by segment

### Adobe Experience Cloud

Official reference: [Adobe Experience Cloud AI agents](https://business.adobe.com/products/sensei/adobe-sensei-genai.html)

Pattern to borrow:

- AI supports audience optimization, journey orchestration, content creation, and personalization.
- Marketing teams can coordinate campaigns across channels and customer journeys.
- Experimentation and optimization are part of the operating model.

Signal adaptation:

- Build simple restoration journeys instead of broad enterprise journey builders.
- Keep journeys persona-specific and operationally grounded.
- Use reports and outcomes to refine campaign recommendations over time.

Feature ideas:

- Emergency homeowner journey
- Insurance agent referral journey
- Plumbing partner handoff journey
- Property manager proof journey
- Campaign variants by persona
- "What proof point should this audience see next?"

### ActiveCampaign

Official reference: [ActiveCampaign AI](https://www.activecampaign.com/ai)

Pattern to borrow:

- Conversational campaign and automation creation.
- AI helps create emails, automations, segments, and reports.
- Automation is accessible to non-technical users.

Signal adaptation:

- Let users create marketing assets through a guided wizard.
- Use plain prompts, but constrain outputs to approved restoration boundaries.
- Keep generated work in draft/pending-approval state.

Feature ideas:

- Campaign Builder Wizard
- Prompt-to-campaign brief
- Draft email, SMS, ad, landing page, and one-pager from one brief
- Plain-English automation setup
- "Generate safe variants" action

### Mailchimp

Official reference: [Mailchimp marketing automation](https://mailchimp.com/features/automations/)

Pattern to borrow:

- Guided marketing automation templates.
- Simple campaign-building flows for non-technical users.
- Clear steps from audience to message to activation.

Signal adaptation:

- Use templates for restoration-specific marketing workflows.
- Keep campaign creation guided and narrow.
- Make the approval step unavoidable before activation.

Feature ideas:

- Emergency water loss campaign template
- Insurance agent handoff template
- Plumbing partner referral template
- Property manager proof campaign template
- Campaign checklist before approval

### Zapier Agents

Official reference: [Zapier Agents](https://zapier.com/agents)

Pattern to borrow:

- Agents work across connected apps and tools.
- Integrations are central to what agents can actually do.
- Users can inspect what tools are connected and what each connection unlocks.

Signal adaptation:

- Build an integration registry that is easy to understand.
- Show which tools are connected, pending, or not configured.
- Tie each integration to a concrete Signal capability.

Feature ideas:

- Integration registry
- "What this unlocks" cards
- Connected tools health
- Agent tool permissions
- Safe handoff to email, CRM, ads, documents, and call tracking

### GoHighLevel

Official reference: [HighLevel platform](https://www.gohighlevel.com/)

Pattern to borrow:

- CRM, funnels, messaging, scheduling, and marketing automation live in one business platform.
- Local-service businesses can manage marketing and follow-up without stitching many tools together manually.

Signal adaptation:

- Keep Signal as the central place for restoration growth work.
- Avoid tool fragmentation by bringing campaign planning, CRM context, AI work, and approvals into one operating view.
- Do not copy the all-in-one sprawl; keep Signal focused on restoration workflows.

Feature ideas:

- Central campaign workspace
- Partner funnel overview
- Lead-to-job journey tracking
- Follow-up task queue
- Tool shortcuts and embedded workspaces

## Signal Feature Backlog From These Patterns

### 1. Today Command Center

Purpose:

Give users one place to start.

Borrowed from:

- HubSpot CRM workspace patterns
- Salesforce work queues
- GoHighLevel all-in-one operational dashboards

Signal version:

- Leads needing review
- Draft assets needing approval
- Records blocking automation
- Agent outputs needing human decision
- Channels worth acting on

### 2. Campaign Builder Wizard

Purpose:

Make campaign creation simple and guided.

Borrowed from:

- Mailchimp automation templates
- ActiveCampaign AI campaign creation
- Adobe journey orchestration

Signal version:

1. Choose audience/persona.
2. Choose loss focus.
3. Choose offer.
4. Choose channels.
5. Generate assets.
6. Review compliance.
7. Send to approval.

### 3. Persona Snapshot

Purpose:

Turn CRM contacts into living customer/partner intelligence.

Borrowed from:

- Klaviyo customer intelligence
- HubSpot CRM AI summaries
- Salesforce record-grounded agents

Signal version:

- Persona type
- Intent level
- Conversion blocker
- Proof needed
- Recommended message
- Next best action
- Campaign content need

### 4. Approval Inbox

Purpose:

Keep AI useful without letting it create brand or compliance risk.

Borrowed from:

- Salesforce trust/guardrail model
- Enterprise approval workflows

Signal version:

- AI-generated copy
- Campaign assets
- Partner emails
- SMS drafts
- Landing page copy
- Risk flags
- Approval state

### 5. Agent Activity Feed

Purpose:

Make agents understandable to operators.

Borrowed from:

- Salesforce Agentforce agent tasks
- Zapier agent/tool activity

Signal version:

- "Compliance agent blocked one coverage-risk phrase."
- "Campaign agent drafted three plumbing partner ads."
- "Data agent found missing phone numbers."
- "Persona agent flagged four ready-to-convert contacts."

### 6. Integration Registry

Purpose:

Show what tools are connected and what they unlock.

Borrowed from:

- Zapier integrations
- HubSpot app ecosystem
- GoHighLevel connected business tools

Signal version:

- Connected
- Ready to connect
- Not configured
- What this integration unlocks
- Which agents can use it
- Approval or permission requirements

### 7. Content Safety Optimizer

Purpose:

Check every generated marketing asset before approval.

Borrowed from:

- Salesforce trust guardrails
- AI content assistants in marketing platforms

Signal version:

- Coverage-neutral language check
- Restoration scope check
- Persona fit check
- Plain-English clarity check
- Off-scope campaign blocker

## What Signal Should Avoid

- Too many dashboards.
- Generic "AI assistant" chat everywhere.
- Complex journey builders that require marketing expertise.
- Automation that can publish without approval.
- Campaigns for hail-only, wind-only, exterior-only roof, or unrelated remodeling.
- Copy that promises insurance coverage, claim approval, or payout outcomes.
- Making operators understand schemas, embeddings, prompts, or agent internals.

## Recommended Next Product Slice

Build the **Campaign Builder Wizard + Approval Inbox** first.

Why:

- It turns Signal into an in-house marketing engine, not just a dashboard.
- It uses persona intelligence, CRM data, reports, and agents together.
- It creates a clear human-in-the-loop workflow.
- It is easy for non-technical users to understand.

Suggested first workflow:

1. User clicks "Build partner campaign."
2. Signal preselects Plumbing Partners from reports.
3. User confirms loss focus: water backup / burst pipe / standing water.
4. Signal generates a brief, email, landing page outline, ad copy, and one-pager.
5. Compliance checks the drafts.
6. Everything lands in Approval Inbox.
7. Approved assets become campaign-ready.
