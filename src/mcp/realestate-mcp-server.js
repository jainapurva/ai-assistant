#!/usr/bin/env node

/**
 * Real Estate MCP Server — lead management, property tracking, showings, and follow-ups.
 *
 * Persists all data in a single JSON file in the agent workspace.
 *
 * Env vars:
 *   DATA_PATH  — path to realestate-data.json (required)
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH;
if (!DATA_PATH) {
  process.stderr.write('ERROR: DATA_PATH env var is required\n');
  process.exit(1);
}

// ── Data persistence ────────────────────────────────────────────────────────

function defaultData() {
  return {
    leads: [],
    properties: [],
    showings: [],
    followups: [],
    // Nurture sequences & enrollments (Phase 3)
    nurtureSequences: [],
    nurtureEnrollments: [],
    // Valuations (Phase 4)
    valuations: [],
    // Lead generation (Phase 5)
    campaigns: [],
    referrals: [],
    expiredListings: [],
    // ID counters
    nextLeadId: 1,
    nextPropertyId: 1,
    nextShowingId: 1,
    nextNurtureSeqId: 1,
    nextValuationId: 1,
    nextCampaignId: 1,
    nextExpiredId: 1,
    createdAt: new Date().toISOString(),
  };
}

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
  } catch (err) {
    process.stderr.write(`WARN: Failed to load data: ${err.message}\n`);
  }
  const d = defaultData();
  saveData(d);
  return d;
}

function saveData(data) {
  const dir = path.dirname(DATA_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_PATH);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateId(prefix, num) {
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function scoreLead(lead) {
  let score = 0;
  // Budget specified
  if (lead.budgetMin || lead.budgetMax) score += 15;
  // Pre-approved financing
  if (lead.preApproved) score += 25;
  // Timeline urgency
  if (lead.timeline === 'immediate' || lead.timeline === '0-30 days') score += 25;
  else if (lead.timeline === '1-3 months') score += 15;
  else if (lead.timeline === '3-6 months') score += 8;
  // Location specified
  if (lead.preferredLocations && lead.preferredLocations.length > 0) score += 10;
  // Property type specified
  if (lead.propertyType) score += 10;
  // Contact info complete
  if (lead.phone) score += 5;
  if (lead.email) score += 5;
  // Has had showings
  if (lead.showingsCount > 0) score += 10;
  // Recent activity
  if (lead.lastContactDate === today()) score += 5;
  return Math.min(score, 100);
}

function scoreCategory(score) {
  if (score >= 75) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

function matchScore(lead, property) {
  let score = 0;
  let reasons = [];

  // Budget match
  if (lead.budgetMax && property.price) {
    if (property.price <= lead.budgetMax) {
      score += 30;
      reasons.push('within budget');
    }
    if (lead.budgetMin && property.price >= lead.budgetMin) {
      score += 10;
      reasons.push('above minimum');
    }
  }

  // Location match
  if (lead.preferredLocations && property.location) {
    const locLower = property.location.toLowerCase();
    const match = lead.preferredLocations.some(l => locLower.includes(l.toLowerCase()));
    if (match) {
      score += 25;
      reasons.push('location match');
    }
  }

  // Property type match
  if (lead.propertyType && property.type) {
    if (lead.propertyType.toLowerCase() === property.type.toLowerCase()) {
      score += 20;
      reasons.push('type match');
    }
  }

  // Bedrooms match
  if (lead.bedroomsMin && property.bedrooms) {
    if (property.bedrooms >= lead.bedroomsMin) {
      score += 10;
      reasons.push('bedrooms match');
    }
  }

  // Area match
  if (lead.areaMin && property.areaSqft) {
    if (property.areaSqft >= lead.areaMin) {
      score += 5;
      reasons.push('area match');
    }
  }

  return { score: Math.min(score, 100), reasons };
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'real-estate',
  version: '1.0.0',
});

// ── Lead Tools ──────────────────────────────────────────────────────────────

server.tool(
  'lead_add',
  'Add a new lead (buyer, seller, renter, or investor). Returns the created lead with auto-generated ID and score.',
  {
    name: z.string().describe('Full name of the lead'),
    phone: z.string().optional().describe('Phone number'),
    email: z.string().optional().describe('Email address'),
    type: z.enum(['buyer', 'seller', 'renter', 'investor']).default('buyer').describe('Lead type'),
    source: z.string().optional().describe('Lead source (e.g., referral, Zillow, Realtor.com, Facebook, open house, website)'),
    propertyType: z.string().optional().describe('Desired property type (e.g., single-family, condo, townhouse, multi-family, commercial)'),
    preferredLocations: z.array(z.string()).optional().describe('Preferred locations/areas'),
    budgetMin: z.number().optional().describe('Minimum budget'),
    budgetMax: z.number().optional().describe('Maximum budget'),
    bedroomsMin: z.number().optional().describe('Minimum bedrooms needed'),
    areaMin: z.number().optional().describe('Minimum area in sqft'),
    timeline: z.string().optional().describe('Purchase timeline (e.g., immediate, 0-30 days, 1-3 months, 3-6 months, 6+ months)'),
    preApproved: z.boolean().optional().describe('Whether financing is pre-approved'),
    notes: z.string().optional().describe('Additional notes about the lead'),
  },
  async (params) => {
    const data = loadData();
    const id = generateId('L', data.nextLeadId++);
    const lead = {
      id,
      ...params,
      preferredLocations: params.preferredLocations || [],
      status: 'new',
      score: 0,
      category: 'cold',
      showingsCount: 0,
      followupsCount: 0,
      lastContactDate: today(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);
    data.leads.push(lead);
    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          lead,
          message: `Lead ${id} created — ${lead.name} (${lead.category.toUpperCase()}, score: ${lead.score})`,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'lead_list',
  'List leads with optional filters. Returns matching leads sorted by score (hottest first).',
  {
    status: z.string().optional().describe('Filter by status (new, contacted, qualified, showing, negotiation, closed-won, closed-lost)'),
    category: z.enum(['hot', 'warm', 'cold']).optional().describe('Filter by lead category'),
    type: z.enum(['buyer', 'seller', 'renter', 'investor']).optional().describe('Filter by lead type'),
    location: z.string().optional().describe('Filter by preferred location (partial match)'),
    budgetMax: z.number().optional().describe('Filter leads with budget up to this amount'),
    limit: z.number().default(20).describe('Max results to return'),
  },
  async (params) => {
    const data = loadData();
    let leads = [...data.leads];

    if (params.status) leads = leads.filter(l => l.status === params.status);
    if (params.category) leads = leads.filter(l => l.category === params.category);
    if (params.type) leads = leads.filter(l => l.type === params.type);
    if (params.location) {
      const loc = params.location.toLowerCase();
      leads = leads.filter(l =>
        l.preferredLocations && l.preferredLocations.some(pl => pl.toLowerCase().includes(loc))
      );
    }
    if (params.budgetMax) leads = leads.filter(l => l.budgetMax && l.budgetMax <= params.budgetMax);

    // Re-score all leads before returning
    leads.forEach(l => {
      l.score = scoreLead(l);
      l.category = scoreCategory(l.score);
    });

    leads.sort((a, b) => b.score - a.score);
    leads = leads.slice(0, params.limit);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: leads.length,
          leads: leads.map(l => ({
            id: l.id,
            name: l.name,
            phone: l.phone,
            type: l.type,
            category: l.category,
            score: l.score,
            status: l.status,
            propertyType: l.propertyType,
            budgetRange: l.budgetMin || l.budgetMax
              ? `${l.budgetMin || '?'} - ${l.budgetMax || '?'}`
              : 'not specified',
            preferredLocations: l.preferredLocations,
            timeline: l.timeline,
            lastContact: l.lastContactDate,
            showings: l.showingsCount,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'lead_view',
  'View complete details of a specific lead by ID.',
  {
    leadId: z.string().describe('Lead ID (e.g., L-0001)'),
  },
  async ({ leadId }) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === leadId);
    if (!lead) {
      return { content: [{ type: 'text', text: `Lead ${leadId} not found.` }] };
    }

    // Get associated showings and follow-ups
    const showings = data.showings.filter(s => s.leadId === leadId);
    const followups = data.followups.filter(f => f.leadId === leadId);

    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ lead, showings, followups }, null, 2),
      }],
    };
  }
);

server.tool(
  'lead_update',
  'Update a lead\'s details — status, notes, contact info, preferences, etc.',
  {
    leadId: z.string().describe('Lead ID (e.g., L-0001)'),
    status: z.string().optional().describe('New status (new, contacted, qualified, showing, negotiation, closed-won, closed-lost)'),
    phone: z.string().optional().describe('Updated phone number'),
    email: z.string().optional().describe('Updated email'),
    propertyType: z.string().optional().describe('Updated property type preference'),
    preferredLocations: z.array(z.string()).optional().describe('Updated preferred locations'),
    budgetMin: z.number().optional().describe('Updated minimum budget'),
    budgetMax: z.number().optional().describe('Updated maximum budget'),
    bedroomsMin: z.number().optional().describe('Updated minimum bedrooms'),
    areaMin: z.number().optional().describe('Updated minimum area in sqft'),
    timeline: z.string().optional().describe('Updated timeline'),
    preApproved: z.boolean().optional().describe('Updated pre-approval status'),
    notes: z.string().optional().describe('Add notes (appended to existing)'),
  },
  async (params) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === params.leadId);
    if (!lead) {
      return { content: [{ type: 'text', text: `Lead ${params.leadId} not found.` }] };
    }

    const { leadId, notes, ...updates } = params;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) lead[key] = value;
    }
    if (notes) {
      const timestamp = new Date().toISOString().split('T')[0];
      lead.notes = lead.notes
        ? `${lead.notes}\n[${timestamp}] ${notes}`
        : `[${timestamp}] ${notes}`;
    }
    lead.lastContactDate = today();
    lead.updatedAt = new Date().toISOString();
    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);

    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          lead,
          message: `Lead ${lead.id} updated — ${lead.name} (${lead.category.toUpperCase()}, score: ${lead.score})`,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'lead_delete',
  'Delete a lead by ID.',
  {
    leadId: z.string().describe('Lead ID to delete (e.g., L-0001)'),
  },
  async ({ leadId }) => {
    const data = loadData();
    const idx = data.leads.findIndex(l => l.id === leadId);
    if (idx === -1) {
      return { content: [{ type: 'text', text: `Lead ${leadId} not found.` }] };
    }
    const removed = data.leads.splice(idx, 1)[0];
    // Also remove associated showings and follow-ups
    data.showings = data.showings.filter(s => s.leadId !== leadId);
    data.followups = data.followups.filter(f => f.leadId !== leadId);
    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Deleted lead ${leadId} (${removed.name}) and associated records.`,
        }, null, 2),
      }],
    };
  }
);

// ── Lead Qualification Tools (Phase 1) ─────────────────────────────────────

function analyzeBantGaps(lead) {
  const gaps = [];
  const fields = [
    { field: 'budget', missing: !lead.budgetMin && !lead.budgetMax, impact: 15, question: 'What\'s your budget range? Are you pre-approved for financing?' },
    { field: 'preApproved', missing: !lead.preApproved, impact: 25, question: 'Have you been pre-approved for a home loan? This helps us match you with the right properties.' },
    { field: 'timeline', missing: !lead.timeline, impact: 25, question: 'When are you looking to move? Immediately, within a few months, or just exploring?' },
    { field: 'preferredLocations', missing: !lead.preferredLocations || lead.preferredLocations.length === 0, impact: 10, question: 'Which areas or neighborhoods are you interested in?' },
    { field: 'propertyType', missing: !lead.propertyType, impact: 10, question: 'What type of property are you looking for? (e.g., single-family, condo, townhouse)' },
    { field: 'phone', missing: !lead.phone, impact: 5, question: 'What\'s the best phone number to reach you?' },
    { field: 'email', missing: !lead.email, impact: 5, question: 'What\'s your email address for property alerts?' },
  ];
  for (const f of fields) {
    if (f.missing) gaps.push(f);
  }
  gaps.sort((a, b) => b.impact - a.impact);
  return gaps;
}

server.tool(
  'lead_qualify',
  'Analyze a lead\'s BANT gaps and suggest the next qualification question. Prioritizes by score impact.',
  {
    leadId: z.string().describe('Lead ID (e.g., L-0001)'),
  },
  async ({ leadId }) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === leadId);
    if (!lead) {
      return { content: [{ type: 'text', text: `Lead ${leadId} not found.` }] };
    }

    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);
    const gaps = analyzeBantGaps(lead);
    const potentialScore = Math.min(lead.score + gaps.reduce((sum, g) => sum + g.impact, 0), 100);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          leadId: lead.id,
          name: lead.name,
          currentScore: lead.score,
          category: lead.category,
          potentialScore,
          missingFields: gaps.map(g => g.field),
          nextQuestion: gaps.length > 0 ? gaps[0].question : null,
          nextField: gaps.length > 0 ? gaps[0].field : null,
          allQuestions: gaps.map(g => ({ field: g.field, question: g.question, scoreImpact: g.impact })),
          fullyQualified: gaps.length === 0,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'lead_search',
  'Search leads by phone, email, or name (partial match).',
  {
    query: z.string().describe('Search query — phone number, email, or name (partial match)'),
  },
  async ({ query }) => {
    const data = loadData();
    const q = query.toLowerCase().replace(/[\s\-()]/g, '');
    const matches = data.leads.filter(l => {
      const name = (l.name || '').toLowerCase();
      const phone = (l.phone || '').replace(/[\s\-()]/g, '');
      const email = (l.email || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || email.includes(q);
    });

    matches.forEach(l => {
      l.score = scoreLead(l);
      l.category = scoreCategory(l.score);
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          total: matches.length,
          leads: matches.map(l => ({
            id: l.id, name: l.name, phone: l.phone, email: l.email,
            type: l.type, category: l.category, score: l.score, status: l.status,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'lead_conversation_log',
  'Append a timestamped interaction entry to a lead\'s conversation history.',
  {
    leadId: z.string().describe('Lead ID'),
    entry: z.string().describe('Interaction note / conversation summary'),
    channel: z.string().default('whatsapp').describe('Channel (whatsapp, telegram, web, phone, email)'),
  },
  async ({ leadId, entry, channel }) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === leadId);
    if (!lead) {
      return { content: [{ type: 'text', text: `Lead ${leadId} not found.` }] };
    }

    if (!lead.conversationLog) lead.conversationLog = [];
    lead.conversationLog.push({
      timestamp: new Date().toISOString(),
      channel,
      entry,
    });
    lead.lastContactDate = today();
    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);
    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Logged interaction for ${lead.name} via ${channel}`,
          totalEntries: lead.conversationLog.length,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'lead_bulk_action',
  'Update multiple leads at once based on filters (e.g., mark all cold leads from a source as closed-lost).',
  {
    filterCategory: z.enum(['hot', 'warm', 'cold']).optional().describe('Filter by category'),
    filterStatus: z.string().optional().describe('Filter by status'),
    filterSource: z.string().optional().describe('Filter by source'),
    filterType: z.enum(['buyer', 'seller', 'renter', 'investor']).optional().describe('Filter by type'),
    action: z.enum(['update_status', 'add_note']).describe('Action to perform'),
    newStatus: z.string().optional().describe('New status (for update_status action)'),
    note: z.string().optional().describe('Note to add (for add_note action)'),
  },
  async (params) => {
    const data = loadData();
    let targets = [...data.leads];

    if (params.filterCategory) targets = targets.filter(l => scoreCategory(scoreLead(l)) === params.filterCategory);
    if (params.filterStatus) targets = targets.filter(l => l.status === params.filterStatus);
    if (params.filterSource) targets = targets.filter(l => l.source && l.source.toLowerCase().includes(params.filterSource.toLowerCase()));
    if (params.filterType) targets = targets.filter(l => l.type === params.filterType);

    if (targets.length === 0) {
      return { content: [{ type: 'text', text: 'No leads match the given filters.' }] };
    }

    const timestamp = today();
    for (const lead of targets) {
      const actual = data.leads.find(l => l.id === lead.id);
      if (params.action === 'update_status' && params.newStatus) {
        actual.status = params.newStatus;
      } else if (params.action === 'add_note' && params.note) {
        actual.notes = actual.notes
          ? `${actual.notes}\n[${timestamp}] ${params.note}`
          : `[${timestamp}] ${params.note}`;
      }
      actual.updatedAt = new Date().toISOString();
      actual.score = scoreLead(actual);
      actual.category = scoreCategory(actual.score);
    }

    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          affected: targets.length,
          action: params.action,
          message: `Updated ${targets.length} leads — ${params.action === 'update_status' ? `status → ${params.newStatus}` : 'note added'}`,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'crm_sync',
  'Sync leads with Follow Up Boss CRM. Push local leads to CRM, pull CRM leads locally, or bidirectional sync.',
  {
    action: z.enum(['push', 'pull', 'list_synced']).describe('push = send to CRM, pull = fetch from CRM, list_synced = show sync status'),
    leadId: z.string().optional().describe('Lead ID to push (required for push action)'),
    query: z.string().optional().describe('Search query for pull action'),
  },
  async (params) => {
    const FUB_API_KEY = process.env.FUB_API_KEY;
    const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:5151';

    if (params.action === 'list_synced') {
      const data = loadData();
      const synced = data.leads.filter(l => l.crmExternalId);
      const unsynced = data.leads.filter(l => !l.crmExternalId);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          synced: synced.length, unsynced: unsynced.length,
          syncedLeads: synced.map(l => ({ id: l.id, name: l.name, crmId: l.crmExternalId, syncedAt: l.crmSyncedAt })),
        }, null, 2) }],
      };
    }

    if (!FUB_API_KEY) {
      return { content: [{ type: 'text', text: 'CRM sync unavailable — Follow Up Boss API key not configured. Set FUB_API_KEY in environment.' }] };
    }

    if (params.action === 'push') {
      if (!params.leadId) return { content: [{ type: 'text', text: 'leadId is required for push action.' }] };
      const data = loadData();
      const lead = data.leads.find(l => l.id === params.leadId);
      if (!lead) return { content: [{ type: 'text', text: `Lead ${params.leadId} not found.` }] };

      try {
        const resp = await fetch('https://api.followupboss.com/v1/people', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(FUB_API_KEY + ':').toString('base64'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: lead.name.split(' ')[0],
            lastName: lead.name.split(' ').slice(1).join(' ') || '',
            phones: lead.phone ? [{ value: lead.phone }] : [],
            emails: lead.email ? [{ value: lead.email }] : [],
            tags: [lead.category, lead.type, `score-${lead.score}`],
            source: lead.source || 'Swayat AI',
            notes: lead.notes || '',
          }),
        });
        const result = await resp.json();
        lead.crmExternalId = result.id || result.personId || 'synced';
        lead.crmSyncedAt = new Date().toISOString();
        saveData(data);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Lead ${lead.name} pushed to Follow Up Boss`, crmId: lead.crmExternalId }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `CRM push failed: ${err.message}` }] };
      }
    }

    if (params.action === 'pull') {
      try {
        const url = params.query
          ? `https://api.followupboss.com/v1/people?sort=created&limit=20&q=${encodeURIComponent(params.query)}`
          : 'https://api.followupboss.com/v1/people?sort=created&limit=20';
        const resp = await fetch(url, {
          headers: { 'Authorization': 'Basic ' + Buffer.from(FUB_API_KEY + ':').toString('base64') },
        });
        const result = await resp.json();
        const people = result.people || [];
        return { content: [{ type: 'text', text: JSON.stringify({
          total: people.length,
          leads: people.map(p => ({
            crmId: p.id, name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            phone: p.phones?.[0]?.value, email: p.emails?.[0]?.value,
            tags: p.tags, source: p.source, created: p.created,
          })),
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `CRM pull failed: ${err.message}` }] };
      }
    }

    return { content: [{ type: 'text', text: 'Invalid action.' }] };
  }
);

server.tool(
  'lead_consent_track',
  'Record consent per lead per channel for TCPA compliance. Track express/written consent and revocations.',
  {
    leadId: z.string().describe('Lead ID'),
    channel: z.enum(['whatsapp', 'sms', 'email', 'phone']).describe('Communication channel'),
    consentType: z.enum(['express', 'written', 'revoked']).describe('Consent type'),
    evidence: z.string().optional().describe('Evidence of consent (message text, form reference, etc.)'),
  },
  async ({ leadId, channel, consentType, evidence }) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === leadId);
    if (!lead) return { content: [{ type: 'text', text: `Lead ${leadId} not found.` }] };

    if (!lead.consents) lead.consents = [];

    if (consentType === 'revoked') {
      // Revoke all consents for this channel
      for (const c of lead.consents) {
        if (c.channel === channel && !c.revokedAt) {
          c.revokedAt = new Date().toISOString();
        }
      }
    } else {
      lead.consents.push({
        channel,
        type: consentType,
        evidence: evidence || '',
        date: new Date().toISOString(),
        revokedAt: null,
      });
    }

    lead.updatedAt = new Date().toISOString();
    saveData(data);

    const activeConsents = lead.consents.filter(c => !c.revokedAt);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          leadId, channel, consentType,
          message: consentType === 'revoked'
            ? `Consent revoked for ${lead.name} on ${channel}. All messaging on this channel must stop.`
            : `${consentType} consent recorded for ${lead.name} on ${channel}.`,
          activeConsents: activeConsents.map(c => ({ channel: c.channel, type: c.type, date: c.date })),
        }, null, 2),
      }],
    };
  }
);

// ── Property Tools ──────────────────────────────────────────────────────────

server.tool(
  'property_add',
  'Add a property listing to your inventory.',
  {
    title: z.string().describe('Property title (e.g., "3BR/2BA in Westlake")'),
    type: z.string().describe('Property type (e.g., single-family, condo, townhouse, multi-family, commercial, penthouse)'),
    location: z.string().describe('Location / area / address'),
    price: z.number().describe('Price (in local currency)'),
    areaSqft: z.number().optional().describe('Area in square feet'),
    bedrooms: z.number().optional().describe('Number of bedrooms'),
    bathrooms: z.number().optional().describe('Number of bathrooms'),
    floor: z.string().optional().describe('Floor (e.g., "3rd of 12")'),
    furnishing: z.string().optional().describe('Furnishing status (unfurnished, semi-furnished, fully-furnished)'),
    amenities: z.array(z.string()).optional().describe('Amenities (e.g., parking, gym, pool, garden, lift)'),
    listingType: z.enum(['sale', 'rent']).default('sale').describe('Sale or rent'),
    mlsId: z.string().optional().describe('MLS listing ID'),
    ownerName: z.string().optional().describe('Owner / builder name'),
    ownerPhone: z.string().optional().describe('Owner / builder phone'),
    description: z.string().optional().describe('Detailed description'),
    status: z.enum(['available', 'under-offer', 'sold', 'rented']).default('available').describe('Listing status'),
  },
  async (params) => {
    const data = loadData();
    const id = generateId('P', data.nextPropertyId++);
    const property = {
      id,
      ...params,
      amenities: params.amenities || [],
      viewsCount: 0,
      showingsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.properties.push(property);
    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          property,
          message: `Property ${id} added — ${property.title} at ${property.location} (${property.price.toLocaleString()})`,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'property_list',
  'List properties with optional filters.',
  {
    type: z.string().optional().describe('Filter by property type'),
    location: z.string().optional().describe('Filter by location (partial match)'),
    priceMax: z.number().optional().describe('Maximum price'),
    priceMin: z.number().optional().describe('Minimum price'),
    bedrooms: z.number().optional().describe('Minimum bedrooms'),
    listingType: z.enum(['sale', 'rent']).optional().describe('Sale or rent'),
    status: z.string().optional().describe('Filter by status (available, under-offer, sold, rented)'),
    limit: z.number().default(20).describe('Max results'),
  },
  async (params) => {
    const data = loadData();
    let properties = [...data.properties];

    if (params.type) {
      const t = params.type.toLowerCase();
      properties = properties.filter(p => p.type.toLowerCase().includes(t));
    }
    if (params.location) {
      const loc = params.location.toLowerCase();
      properties = properties.filter(p => p.location.toLowerCase().includes(loc));
    }
    if (params.priceMax) properties = properties.filter(p => p.price <= params.priceMax);
    if (params.priceMin) properties = properties.filter(p => p.price >= params.priceMin);
    if (params.bedrooms) properties = properties.filter(p => p.bedrooms && p.bedrooms >= params.bedrooms);
    if (params.listingType) properties = properties.filter(p => p.listingType === params.listingType);
    if (params.status) properties = properties.filter(p => p.status === params.status);

    properties = properties.slice(0, params.limit);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: properties.length,
          properties: properties.map(p => ({
            id: p.id,
            title: p.title,
            type: p.type,
            location: p.location,
            price: p.price,
            areaSqft: p.areaSqft,
            bedrooms: p.bedrooms,
            listingType: p.listingType,
            status: p.status,
            showings: p.showingsCount,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'property_update',
  'Update a property listing.',
  {
    propertyId: z.string().describe('Property ID (e.g., P-0001)'),
    price: z.number().optional().describe('Updated price'),
    status: z.enum(['available', 'under-offer', 'sold', 'rented']).optional().describe('Updated status'),
    description: z.string().optional().describe('Updated description'),
    furnishing: z.string().optional().describe('Updated furnishing'),
    amenities: z.array(z.string()).optional().describe('Updated amenities list'),
  },
  async (params) => {
    const data = loadData();
    const property = data.properties.find(p => p.id === params.propertyId);
    if (!property) {
      return { content: [{ type: 'text', text: `Property ${params.propertyId} not found.` }] };
    }

    const { propertyId, ...updates } = params;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) property[key] = value;
    }
    property.updatedAt = new Date().toISOString();
    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          property,
          message: `Property ${property.id} updated — ${property.title}`,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'property_match',
  'Find properties matching a lead\'s preferences. Returns best matches with match scores.',
  {
    leadId: z.string().describe('Lead ID to match properties for'),
  },
  async ({ leadId }) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === leadId);
    if (!lead) {
      return { content: [{ type: 'text', text: `Lead ${leadId} not found.` }] };
    }

    const available = data.properties.filter(p => p.status === 'available');
    const matches = available.map(p => {
      const { score, reasons } = matchScore(lead, p);
      return { property: p, matchScore: score, matchReasons: reasons };
    });

    matches.sort((a, b) => b.matchScore - a.matchScore);
    const topMatches = matches.filter(m => m.matchScore > 0).slice(0, 10);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          lead: { id: lead.id, name: lead.name, category: lead.category },
          matches: topMatches.map(m => ({
            propertyId: m.property.id,
            title: m.property.title,
            location: m.property.location,
            price: m.property.price,
            type: m.property.type,
            bedrooms: m.property.bedrooms,
            areaSqft: m.property.areaSqft,
            matchScore: m.matchScore,
            matchReasons: m.matchReasons,
          })),
          totalMatches: topMatches.length,
        }, null, 2),
      }],
    };
  }
);

// ── Showing Tools ───────────────────────────────────────────────────────────

server.tool(
  'showing_schedule',
  'Schedule a property showing / site visit for a lead.',
  {
    leadId: z.string().describe('Lead ID'),
    propertyId: z.string().describe('Property ID'),
    date: z.string().describe('Showing date (YYYY-MM-DD)'),
    time: z.string().describe('Showing time (HH:MM)'),
    notes: z.string().optional().describe('Notes for the showing'),
  },
  async (params) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === params.leadId);
    if (!lead) {
      return { content: [{ type: 'text', text: `Lead ${params.leadId} not found.` }] };
    }
    const property = data.properties.find(p => p.id === params.propertyId);
    if (!property) {
      return { content: [{ type: 'text', text: `Property ${params.propertyId} not found.` }] };
    }

    const id = generateId('S', data.nextShowingId++);
    const showing = {
      id,
      leadId: params.leadId,
      leadName: lead.name,
      propertyId: params.propertyId,
      propertyTitle: property.title,
      propertyLocation: property.location,
      date: params.date,
      time: params.time,
      status: 'scheduled',
      notes: params.notes || '',
      createdAt: new Date().toISOString(),
    };
    data.showings.push(showing);

    // Update counters
    lead.showingsCount = (lead.showingsCount || 0) + 1;
    lead.status = lead.status === 'new' ? 'showing' : lead.status;
    lead.lastContactDate = today();
    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);
    property.showingsCount = (property.showingsCount || 0) + 1;

    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          showing,
          message: `Showing ${id} scheduled — ${lead.name} at ${property.title} on ${params.date} ${params.time}`,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'showing_list',
  'List showings. Shows upcoming by default, with optional filters.',
  {
    status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional().describe('Filter by status'),
    leadId: z.string().optional().describe('Filter by lead ID'),
    date: z.string().optional().describe('Filter by specific date (YYYY-MM-DD)'),
    upcoming: z.boolean().default(true).describe('Show only upcoming (today and future)'),
  },
  async (params) => {
    const data = loadData();
    let showings = [...data.showings];

    if (params.status) showings = showings.filter(s => s.status === params.status);
    if (params.leadId) showings = showings.filter(s => s.leadId === params.leadId);
    if (params.date) showings = showings.filter(s => s.date === params.date);
    if (params.upcoming) {
      const todayStr = today();
      showings = showings.filter(s => s.date >= todayStr && s.status === 'scheduled');
    }

    showings.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: showings.length,
          showings,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'showing_update',
  'Update a showing status (completed, cancelled, no-show) or reschedule.',
  {
    showingId: z.string().describe('Showing ID (e.g., S-0001)'),
    status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional().describe('Updated status'),
    date: z.string().optional().describe('Reschedule to new date (YYYY-MM-DD)'),
    time: z.string().optional().describe('Reschedule to new time (HH:MM)'),
    notes: z.string().optional().describe('Add notes'),
    feedback: z.string().optional().describe('Client feedback after showing'),
  },
  async (params) => {
    const data = loadData();
    const showing = data.showings.find(s => s.id === params.showingId);
    if (!showing) {
      return { content: [{ type: 'text', text: `Showing ${params.showingId} not found.` }] };
    }

    if (params.status) showing.status = params.status;
    if (params.date) showing.date = params.date;
    if (params.time) showing.time = params.time;
    if (params.notes) showing.notes = params.notes;
    if (params.feedback) showing.feedback = params.feedback;

    // Auto-create follow-up when showing is completed
    if (params.status === 'completed') {
      const followupDate = new Date();
      followupDate.setDate(followupDate.getDate() + 1);
      data.followups.push({
        leadId: showing.leadId,
        leadName: showing.leadName,
        type: 'post-showing',
        date: followupDate.toISOString().split('T')[0],
        notes: `Follow up after showing at ${showing.propertyTitle}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          showing,
          message: `Showing ${showing.id} updated.${params.status === 'completed' ? ' Auto-created follow-up for tomorrow.' : ''}`,
        }, null, 2),
      }],
    };
  }
);

// ── Follow-up Tools ─────────────────────────────────────────────────────────

server.tool(
  'followup_add',
  'Schedule a follow-up reminder for a lead.',
  {
    leadId: z.string().describe('Lead ID'),
    date: z.string().describe('Follow-up date (YYYY-MM-DD)'),
    type: z.string().default('general').describe('Follow-up type (general, post-showing, price-update, check-in, offer)'),
    notes: z.string().optional().describe('Notes / what to discuss'),
  },
  async (params) => {
    const data = loadData();
    const lead = data.leads.find(l => l.id === params.leadId);
    if (!lead) {
      return { content: [{ type: 'text', text: `Lead ${params.leadId} not found.` }] };
    }

    const followup = {
      leadId: params.leadId,
      leadName: lead.name,
      type: params.type,
      date: params.date,
      notes: params.notes || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    data.followups.push(followup);
    lead.followupsCount = (lead.followupsCount || 0) + 1;
    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          followup,
          message: `Follow-up scheduled for ${lead.name} on ${params.date}`,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'followup_list',
  'List follow-ups. Shows today\'s and overdue by default.',
  {
    period: z.enum(['today', 'overdue', 'this-week', 'upcoming', 'all']).default('today').describe('Time period to show'),
    status: z.enum(['pending', 'done', 'skipped']).optional().describe('Filter by status'),
    leadId: z.string().optional().describe('Filter by lead ID'),
  },
  async (params) => {
    const data = loadData();
    let followups = [...data.followups];

    if (params.status) followups = followups.filter(f => f.status === params.status);
    if (params.leadId) followups = followups.filter(f => f.leadId === params.leadId);

    const todayStr = today();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    switch (params.period) {
      case 'today':
        followups = followups.filter(f => f.date === todayStr && f.status === 'pending');
        break;
      case 'overdue':
        followups = followups.filter(f => f.date < todayStr && f.status === 'pending');
        break;
      case 'this-week':
        followups = followups.filter(f => f.date >= todayStr && f.date <= weekEndStr && f.status === 'pending');
        break;
      case 'upcoming':
        followups = followups.filter(f => f.date >= todayStr && f.status === 'pending');
        break;
      case 'all':
        break;
    }

    followups.sort((a, b) => a.date.localeCompare(b.date));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          period: params.period,
          total: followups.length,
          followups,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'followup_complete',
  'Mark a follow-up as done or skipped.',
  {
    leadId: z.string().describe('Lead ID'),
    date: z.string().describe('Follow-up date to mark (YYYY-MM-DD)'),
    status: z.enum(['done', 'skipped']).default('done').describe('Mark as done or skipped'),
    outcome: z.string().optional().describe('What happened during the follow-up'),
  },
  async (params) => {
    const data = loadData();
    const followup = data.followups.find(f =>
      f.leadId === params.leadId && f.date === params.date && f.status === 'pending'
    );
    if (!followup) {
      return { content: [{ type: 'text', text: `No pending follow-up found for ${params.leadId} on ${params.date}.` }] };
    }

    followup.status = params.status;
    followup.completedAt = new Date().toISOString();
    if (params.outcome) followup.outcome = params.outcome;

    // Update lead's last contact date
    const lead = data.leads.find(l => l.id === params.leadId);
    if (lead) {
      lead.lastContactDate = today();
      lead.score = scoreLead(lead);
      lead.category = scoreCategory(lead.score);
    }

    saveData(data);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          followup,
          message: `Follow-up for ${followup.leadName} marked as ${params.status}.`,
        }, null, 2),
      }],
    };
  }
);

// ── Pipeline & Stats ────────────────────────────────────────────────────────

server.tool(
  'pipeline_stats',
  'Get a complete dashboard — lead pipeline, conversion funnel, upcoming showings, overdue follow-ups, and top properties.',
  {},
  async () => {
    const data = loadData();
    const todayStr = today();

    // Lead stats
    const totalLeads = data.leads.length;
    const hot = data.leads.filter(l => scoreCategory(scoreLead(l)) === 'hot').length;
    const warm = data.leads.filter(l => scoreCategory(scoreLead(l)) === 'warm').length;
    const cold = data.leads.filter(l => scoreCategory(scoreLead(l)) === 'cold').length;

    // Status pipeline
    const pipeline = {};
    for (const l of data.leads) {
      pipeline[l.status] = (pipeline[l.status] || 0) + 1;
    }

    // Conversion
    const closedWon = data.leads.filter(l => l.status === 'closed-won').length;
    const closedLost = data.leads.filter(l => l.status === 'closed-lost').length;
    const conversionRate = totalLeads > 0
      ? ((closedWon / totalLeads) * 100).toFixed(1)
      : '0.0';

    // Today's showings
    const todaysShowings = data.showings.filter(s => s.date === todayStr && s.status === 'scheduled');

    // Upcoming showings (next 7 days)
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const upcomingShowings = data.showings.filter(s =>
      s.date >= todayStr && s.date <= weekEndStr && s.status === 'scheduled'
    );

    // Overdue follow-ups
    const overdueFollowups = data.followups.filter(f => f.date < todayStr && f.status === 'pending');

    // Today's follow-ups
    const todaysFollowups = data.followups.filter(f => f.date === todayStr && f.status === 'pending');

    // Property stats
    const totalProperties = data.properties.length;
    const availableProperties = data.properties.filter(p => p.status === 'available').length;
    const soldProperties = data.properties.filter(p => p.status === 'sold' || p.status === 'rented').length;

    // Top properties by showings
    const topProperties = [...data.properties]
      .sort((a, b) => (b.showingsCount || 0) - (a.showingsCount || 0))
      .slice(0, 5)
      .map(p => ({ id: p.id, title: p.title, showings: p.showingsCount, status: p.status }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          date: todayStr,
          leads: { total: totalLeads, hot, warm, cold, pipeline },
          conversion: { won: closedWon, lost: closedLost, rate: `${conversionRate}%` },
          showings: {
            today: todaysShowings.length,
            thisWeek: upcomingShowings.length,
            todaysList: todaysShowings.map(s => ({
              id: s.id, lead: s.leadName, property: s.propertyTitle, time: s.time,
            })),
          },
          followups: {
            overdue: overdueFollowups.length,
            today: todaysFollowups.length,
            overdueList: overdueFollowups.map(f => ({
              lead: f.leadName, date: f.date, type: f.type,
            })),
            todaysList: todaysFollowups.map(f => ({
              lead: f.leadName, type: f.type, notes: f.notes,
            })),
          },
          properties: { total: totalProperties, available: availableProperties, sold: soldProperties, topByShowings: topProperties },
        }, null, 2),
      }],
    };
  }
);

// ── Nurture Sequence Tools (Phase 2) ───────────────────────────────────────

function ensureNurtureDefaults(data) {
  if (!data.nurtureSequences) data.nurtureSequences = [];
  if (!data.nurtureEnrollments) data.nurtureEnrollments = [];
  if (!data.nextNurtureSeqId) data.nextNurtureSeqId = 1;
  if (data.nurtureSequences.length === 0) {
    const defaults = [
      { name: 'Hot Lead Daily', triggerCategory: 'hot', steps: [
        { delayDays: 1, messageType: 'property_match' }, { delayDays: 2, messageType: 'check_in' },
        { delayDays: 4, messageType: 'property_match' }, { delayDays: 7, messageType: 'check_in' },
        { delayDays: 10, messageType: 'property_match' }, { delayDays: 14, messageType: 'check_in' },
        { delayDays: 21, messageType: 'property_match' },
      ]},
      { name: 'Warm Lead Weekly', triggerCategory: 'warm', steps: [
        { delayDays: 7, messageType: 'market_update' }, { delayDays: 14, messageType: 'property_match' },
        { delayDays: 21, messageType: 'check_in' }, { delayDays: 28, messageType: 'market_update' },
        { delayDays: 42, messageType: 'property_match' }, { delayDays: 56, messageType: 'check_in' },
      ]},
      { name: 'Cold Lead Monthly', triggerCategory: 'cold', steps: [
        { delayDays: 30, messageType: 'market_update' }, { delayDays: 60, messageType: 'check_in' },
        { delayDays: 90, messageType: 'market_update' }, { delayDays: 120, messageType: 'check_in' },
        { delayDays: 150, messageType: 'market_update' }, { delayDays: 180, messageType: 'check_in' },
      ]},
      { name: 'Post-Showing Follow-Up', triggerCategory: 'post-showing', steps: [
        { delayDays: 0, messageType: 'custom', customMessage: 'Thanks for visiting the property today! What did you think? Any questions?' },
        { delayDays: 1, messageType: 'check_in' }, { delayDays: 3, messageType: 'property_match' },
        { delayDays: 7, messageType: 'check_in' },
      ]},
      { name: 'Post-Close Nurture', triggerCategory: 'post-close', steps: [
        { delayDays: 30, messageType: 'custom', customMessage: 'Congratulations on your 1-month home anniversary! How are you settling in?' },
        { delayDays: 90, messageType: 'market_update' },
        { delayDays: 180, messageType: 'custom', customMessage: 'It\'s been 6 months in your new home! If any friends or family are looking, I\'d love to help them too.' },
        { delayDays: 365, messageType: 'custom', customMessage: 'Happy 1-year home anniversary! Here\'s how your home value has changed...' },
      ]},
    ];
    for (const d of defaults) {
      const id = generateId('NS', data.nextNurtureSeqId++);
      data.nurtureSequences.push({ id, ...d, enabled: true, createdAt: new Date().toISOString() });
    }
    saveData(data);
  }
}

function autoEnrollLead(data, lead) {
  ensureNurtureDefaults(data);
  const category = lead.category;
  const seq = data.nurtureSequences.find(s => s.triggerCategory === category && s.enabled);
  if (!seq) return;
  const already = data.nurtureEnrollments.find(e => e.leadId === lead.id && e.sequenceId === seq.id && e.status === 'active');
  if (already) return;
  // Unenroll from other category sequences
  for (const e of data.nurtureEnrollments) {
    if (e.leadId === lead.id && e.status === 'active') {
      const s = data.nurtureSequences.find(ns => ns.id === e.sequenceId);
      if (s && ['hot', 'warm', 'cold'].includes(s.triggerCategory)) {
        e.status = 'completed';
        e.completedAt = new Date().toISOString();
      }
    }
  }
  const nextSend = new Date();
  nextSend.setDate(nextSend.getDate() + (seq.steps[0]?.delayDays || 1));
  data.nurtureEnrollments.push({
    leadId: lead.id, sequenceId: seq.id, currentStep: 0,
    status: 'active', nextSendAt: nextSend.toISOString(),
    enrolledAt: new Date().toISOString(), completedAt: null,
  });
}

server.tool(
  'nurture_create',
  'Create a custom nurture sequence template.',
  {
    name: z.string().describe('Sequence name (e.g., "Investor Follow-Up")'),
    triggerCategory: z.string().describe('Trigger category (hot, warm, cold, post-showing, post-close, custom)'),
    steps: z.array(z.object({
      delayDays: z.number().describe('Days after enrollment (or previous step) to send'),
      messageType: z.enum(['property_match', 'market_update', 'check_in', 'custom']).describe('Type of message'),
      customMessage: z.string().optional().describe('Custom message template (for custom type)'),
    })).describe('Sequence steps'),
  },
  async ({ name, triggerCategory, steps }) => {
    const data = loadData();
    ensureNurtureDefaults(data);
    const id = generateId('NS', data.nextNurtureSeqId++);
    const seq = { id, name, triggerCategory, steps, enabled: true, createdAt: new Date().toISOString() };
    data.nurtureSequences.push(seq);
    saveData(data);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, sequence: seq, message: `Nurture sequence "${name}" created with ${steps.length} steps` }, null, 2) }] };
  }
);

server.tool(
  'nurture_list',
  'List all nurture sequences with enrollment counts.',
  {},
  async () => {
    const data = loadData();
    ensureNurtureDefaults(data);
    const seqs = data.nurtureSequences.map(s => {
      const enrollments = data.nurtureEnrollments.filter(e => e.sequenceId === s.id);
      return {
        id: s.id, name: s.name, triggerCategory: s.triggerCategory, enabled: s.enabled,
        stepsCount: s.steps.length,
        activeEnrollments: enrollments.filter(e => e.status === 'active').length,
        totalEnrollments: enrollments.length,
      };
    });
    return { content: [{ type: 'text', text: JSON.stringify({ total: seqs.length, sequences: seqs }, null, 2) }] };
  }
);

server.tool(
  'nurture_enroll',
  'Enroll a lead in a nurture sequence.',
  {
    leadId: z.string().describe('Lead ID'),
    sequenceId: z.string().describe('Nurture sequence ID (e.g., NS-0001)'),
  },
  async ({ leadId, sequenceId }) => {
    const data = loadData();
    ensureNurtureDefaults(data);
    const lead = data.leads.find(l => l.id === leadId);
    if (!lead) return { content: [{ type: 'text', text: `Lead ${leadId} not found.` }] };
    const seq = data.nurtureSequences.find(s => s.id === sequenceId);
    if (!seq) return { content: [{ type: 'text', text: `Sequence ${sequenceId} not found.` }] };
    const existing = data.nurtureEnrollments.find(e => e.leadId === leadId && e.sequenceId === sequenceId && e.status === 'active');
    if (existing) return { content: [{ type: 'text', text: `${lead.name} is already enrolled in "${seq.name}".` }] };

    const nextSend = new Date();
    nextSend.setDate(nextSend.getDate() + (seq.steps[0]?.delayDays || 1));
    const enrollment = {
      leadId, sequenceId, currentStep: 0, status: 'active',
      nextSendAt: nextSend.toISOString(), enrolledAt: new Date().toISOString(), completedAt: null,
    };
    data.nurtureEnrollments.push(enrollment);
    saveData(data);
    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, enrollment, message: `${lead.name} enrolled in "${seq.name}" — next send: ${nextSend.toISOString().split('T')[0]}`,
    }, null, 2) }] };
  }
);

server.tool(
  'nurture_status',
  'Show active nurture enrollments, upcoming and overdue sends.',
  {
    leadId: z.string().optional().describe('Filter by lead ID (optional — shows all if omitted)'),
  },
  async ({ leadId }) => {
    const data = loadData();
    ensureNurtureDefaults(data);
    let enrollments = data.nurtureEnrollments.filter(e => e.status === 'active');
    if (leadId) enrollments = enrollments.filter(e => e.leadId === leadId);

    const now = new Date();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);

    const enriched = enrollments.map(e => {
      const lead = data.leads.find(l => l.id === e.leadId);
      const seq = data.nurtureSequences.find(s => s.id === e.sequenceId);
      const nextSendDate = new Date(e.nextSendAt);
      return {
        leadId: e.leadId, leadName: lead?.name, sequenceName: seq?.name,
        currentStep: e.currentStep, totalSteps: seq?.steps.length,
        nextSendAt: e.nextSendAt, isOverdue: nextSendDate < now,
        isUpcoming: nextSendDate >= now && nextSendDate <= weekLater,
      };
    });

    return { content: [{ type: 'text', text: JSON.stringify({
      activeEnrollments: enriched.length,
      overdue: enriched.filter(e => e.isOverdue).length,
      upcoming7Days: enriched.filter(e => e.isUpcoming).length,
      enrollments: enriched,
    }, null, 2) }] };
  }
);

server.tool(
  'nurture_pause',
  'Pause or resume a lead\'s nurture enrollment.',
  {
    leadId: z.string().describe('Lead ID'),
    sequenceId: z.string().optional().describe('Sequence ID (pauses all if omitted)'),
    action: z.enum(['pause', 'resume']).describe('Pause or resume'),
  },
  async ({ leadId, sequenceId, action }) => {
    const data = loadData();
    let targets = data.nurtureEnrollments.filter(e => e.leadId === leadId);
    if (sequenceId) targets = targets.filter(e => e.sequenceId === sequenceId);
    if (action === 'pause') targets = targets.filter(e => e.status === 'active');
    if (action === 'resume') targets = targets.filter(e => e.status === 'paused');

    for (const e of targets) {
      e.status = action === 'pause' ? 'paused' : 'active';
    }
    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, affected: targets.length,
      message: `${action === 'pause' ? 'Paused' : 'Resumed'} ${targets.length} nurture enrollment(s) for ${leadId}`,
    }, null, 2) }] };
  }
);

server.tool(
  'nurture_process',
  'Process all due nurture sends. Returns messages to deliver. Called by scheduler or manually.',
  {},
  async () => {
    const data = loadData();
    ensureNurtureDefaults(data);
    const now = new Date();
    const due = data.nurtureEnrollments.filter(e => e.status === 'active' && new Date(e.nextSendAt) <= now);
    const messages = [];

    for (const enrollment of due) {
      const lead = data.leads.find(l => l.id === enrollment.leadId);
      const seq = data.nurtureSequences.find(s => s.id === enrollment.sequenceId);
      if (!lead || !seq) continue;

      const step = seq.steps[enrollment.currentStep];
      if (!step) {
        enrollment.status = 'completed';
        enrollment.completedAt = now.toISOString();
        continue;
      }

      let messageContent = '';
      switch (step.messageType) {
        case 'property_match': {
          const available = data.properties.filter(p => p.status === 'available');
          const matches = available.map(p => ({ property: p, ...matchScore(lead, p) }))
            .filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
          if (matches.length > 0) {
            messageContent = `Hi ${lead.name}! Here are ${matches.length} new properties matching your search:\n\n` +
              matches.map((m, i) => `${i + 1}. *${m.property.title}* — ${m.property.location}\n   💰 ${m.property.price?.toLocaleString()} | ${m.property.bedrooms || '?'} bed | ${m.property.areaSqft || '?'} sqft\n   Match: ${m.score}% (${m.reasons.join(', ')})`).join('\n\n') +
              '\n\nWant to schedule a visit for any of these?';
          } else {
            messageContent = `Hi ${lead.name}! I'm still looking for properties that match your preferences. I'll reach out as soon as something great comes up!`;
          }
          break;
        }
        case 'market_update': {
          const location = lead.preferredLocations?.[0] || 'your area';
          const areaProps = data.properties.filter(p => {
            if (!lead.preferredLocations?.length) return true;
            return lead.preferredLocations.some(pl => p.location?.toLowerCase().includes(pl.toLowerCase()));
          });
          const avgPrice = areaProps.length > 0 ? Math.round(areaProps.reduce((s, p) => s + (p.price || 0), 0) / areaProps.length) : null;
          messageContent = `Hi ${lead.name}! Quick market update for ${location}:\n` +
            `📊 ${areaProps.length} active listings` +
            (avgPrice ? ` | Avg price: ${avgPrice.toLocaleString()}` : '') +
            '\n\nWant me to find something specific for you?';
          break;
        }
        case 'check_in':
          messageContent = `Hi ${lead.name}! Just checking in — has anything changed with your property search? Happy to help with updated matches or answer any questions.`;
          break;
        case 'custom':
          messageContent = step.customMessage || `Hi ${lead.name}! Just following up. Let me know if you need anything.`;
          break;
      }

      messages.push({
        leadId: lead.id, leadName: lead.name, leadPhone: lead.phone,
        sequenceName: seq.name, stepNumber: enrollment.currentStep + 1,
        messageType: step.messageType, content: messageContent,
      });

      // Advance to next step
      enrollment.currentStep++;
      if (enrollment.currentStep >= seq.steps.length) {
        enrollment.status = 'completed';
        enrollment.completedAt = now.toISOString();
      } else {
        const nextStep = seq.steps[enrollment.currentStep];
        const nextSend = new Date(now);
        nextSend.setDate(nextSend.getDate() + (nextStep.delayDays || 1));
        enrollment.nextSendAt = nextSend.toISOString();
      }

      lead.lastContactDate = today();
    }

    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      processed: messages.length, messages,
      message: messages.length > 0
        ? `Processed ${messages.length} nurture messages. Deliver these to the respective leads.`
        : 'No nurture messages due at this time.',
    }, null, 2) }] };
  }
);

// ── Lead Generation Tools (Phase 3) ───────────────────────────────────────

server.tool(
  'leadgen_buyer_campaign',
  'Create a buyer lead generation campaign. Generates ad copy for social media, email, and WhatsApp targeting potential buyers.',
  {
    propertyId: z.string().optional().describe('Feature a specific property (optional)'),
    location: z.string().optional().describe('Target area/neighborhood'),
    propertyType: z.string().optional().describe('Target property type (single-family, condo, townhouse, etc.)'),
    priceRange: z.string().optional().describe('Price range (e.g., "50L-80L" or "under 1Cr")'),
    channels: z.array(z.enum(['social', 'email', 'whatsapp'])).default(['social']).describe('Publication channels'),
    targetAudience: z.string().default('general').describe('Audience: first-time buyers, investors, upgraders, relocators, general'),
  },
  async (params) => {
    const data = loadData();
    if (!data.campaigns) data.campaigns = [];
    if (!data.nextCampaignId) data.nextCampaignId = 1;

    let property = null;
    if (params.propertyId) {
      property = data.properties.find(p => p.id === params.propertyId);
      if (!property) return { content: [{ type: 'text', text: `Property ${params.propertyId} not found.` }] };
    }

    const location = property?.location || params.location || 'your area';
    const type = property?.type || params.propertyType || 'property';
    const price = property ? property.price?.toLocaleString() : params.priceRange || '';

    const content = {
      social: `🏠 Looking for a ${type} in ${location}?${price ? ` Starting at ${price}!` : ''}\n\n${property ? `✨ ${property.title}\n📍 ${property.location}\n💰 ${price}\n🛏 ${property.bedrooms || '?'} Bed | 📐 ${property.areaSqft || '?'} sqft` : `We have amazing options for ${params.targetAudience === 'first-time buyers' ? 'first-time home buyers' : params.targetAudience === 'investors' ? 'smart investors' : 'you'}!`}\n\n💬 DM us "INTERESTED" or call now!\n#RealEstate #${location.replace(/[^a-zA-Z]/g, '')} #PropertyForSale`,
      email: `Subject: ${property ? `Don't Miss: ${property.title}` : `New ${type} Listings in ${location}`}\n\nHi,\n\n${property ? `I wanted to share this property that just came on the market:\n\n${property.title}\n${property.location} | ${price} | ${property.bedrooms || '?'} Bed | ${property.areaSqft || '?'} sqft\n\n${property.description || ''}` : `We have exciting new ${type} listings in ${location}${price ? ` in the ${price} range` : ''}. Perfect for ${params.targetAudience}.`}\n\nReply to this email or call me to schedule a visit.\n\nBest regards`,
      whatsapp: `Hi! 👋\n\n${property ? `Check out this *${property.title}*:\n📍 ${property.location}\n💰 ${price}\n🛏 ${property.bedrooms || '?'} Bed | 📐 ${property.areaSqft || '?'} sqft` : `I have great *${type}* options in *${location}*${price ? ` (${price})` : ''}!`}\n\nReply if you'd like more details or to schedule a visit!`,
    };

    const campaign = {
      id: generateId('C', data.nextCampaignId++),
      type: 'buyer', name: property ? `Buyer Campaign: ${property.title}` : `Buyer Campaign: ${type} in ${location}`,
      channels: params.channels, targetAudience: params.targetAudience,
      content, propertyId: params.propertyId || null, location,
      leadsGenerated: 0, status: 'active',
      publishedAt: null, createdAt: new Date().toISOString(),
    };
    data.campaigns.push(campaign);
    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, campaign,
      message: `Buyer campaign "${campaign.name}" created. Review the content above and use listing_publish to post to ${params.channels.join(', ')}.`,
    }, null, 2) }] };
  }
);

server.tool(
  'leadgen_social_content',
  'Generate a content calendar of social media posts designed to attract leads.',
  {
    contentType: z.enum(['property_spotlight', 'market_tips', 'buyer_guide', 'success_story', 'open_house_invite']).describe('Type of content'),
    location: z.string().optional().describe('Target location'),
    count: z.number().default(5).describe('Number of posts to generate'),
  },
  async ({ contentType, location, count }) => {
    const data = loadData();
    const loc = location || 'the area';
    const templates = {
      property_spotlight: (i) => ({
        content: `🏠 Property Spotlight #${i + 1}\n\nLooking for your dream home in ${loc}? Here's what's new on the market!\n\n📍 Prime location\n💰 Competitive pricing\n✨ Modern amenities\n\nDM me "DETAILS" to learn more!\n\n#PropertySpotlight #${loc.replace(/[^a-zA-Z]/g, '')} #RealEstate #HomeBuying`,
        platform: 'instagram', suggestedDay: `Day ${i * 3 + 1}`,
      }),
      market_tips: (i) => ({
        content: [
          `📊 Market Tip: In ${loc}, properties are selling ${Math.floor(Math.random() * 10 + 5)}% faster than last year. If you're thinking about buying, now's the time!\n\n#MarketTip #RealEstate`,
          `💡 Did you know? Getting pre-approved for a mortgage can make your offer 3x more likely to be accepted. Need help getting started? DM me!\n\n#HomeBuyingTip #MortgageTips`,
          `🔑 Pro tip: The first 24 hours a listing goes live is when it gets the most attention. Set up alerts so you never miss a new listing!\n\n#RealEstateTips`,
          `📈 Market Update: Inventory in ${loc} is at ${Math.floor(Math.random() * 3 + 2)} months supply. What does this mean for buyers? DM me to find out!\n\n#MarketUpdate`,
          `💰 Thinking about selling? Homes in ${loc} are averaging ${Math.floor(Math.random() * 10 + 95)}% of asking price. Get a free home valuation — DM me your address!\n\n#HomeValue`,
        ][i % 5],
        platform: 'twitter', suggestedDay: `Day ${i * 2 + 1}`,
      }),
      buyer_guide: (i) => ({
        content: [
          `🏠 First-Time Buyer Guide (1/${count})\n\nStep 1: Get pre-approved BEFORE you start looking. This tells you exactly what you can afford and makes sellers take you seriously.\n\nNeed a lender referral? DM me!\n\n#FirstTimeBuyer`,
          `🏠 First-Time Buyer Guide (2/${count})\n\nStep 2: Make a must-have vs nice-to-have list. Be honest about what you need vs want — it'll save you months of searching.\n\n#HomeBuyingTips`,
          `🏠 First-Time Buyer Guide (3/${count})\n\nStep 3: Research neighborhoods at different times of day. A quiet street at 2pm might be a highway at 5pm!\n\n#NeighborhoodTips`,
          `🏠 First-Time Buyer Guide (4/${count})\n\nStep 4: Don't skip the home inspection. It could save you thousands in surprise repairs.\n\n#HomeInspection`,
          `🏠 First-Time Buyer Guide (5/${count})\n\nStep 5: Your agent is your advocate. Use someone who knows ${loc} inside and out. That's me! 😊\n\nDM me to start your search.\n\n#RealEstateAgent`,
        ][i % 5],
        platform: 'instagram', suggestedDay: `Day ${i * 3 + 1}`,
      }),
      success_story: (i) => ({
        content: `🎉 Another happy homeowner!\n\nClient #${i + 1} just closed on their dream home in ${loc}! From first inquiry to keys in hand, the whole process took just ${Math.floor(Math.random() * 30 + 30)} days.\n\n"Working with an AI-powered agent made everything so smooth!" — Happy Client\n\nReady to be next? DM me!\n\n#SuccessStory #HappyHomeowner #${loc.replace(/[^a-zA-Z]/g, '')}`,
        platform: 'instagram', suggestedDay: `Day ${i * 7 + 1}`,
      }),
      open_house_invite: (i) => ({
        content: `🏡 OPEN HOUSE this weekend!\n\n📍 ${loc}\n🕐 Saturday & Sunday, 10am-4pm\n\n✅ No appointment needed\n✅ Free refreshments\n✅ Meet the agent\n✅ See the neighborhood\n\nBring your family and friends! Tag someone who's looking for a home 👇\n\n#OpenHouse #${loc.replace(/[^a-zA-Z]/g, '')} #HomeTour`,
        platform: 'facebook', suggestedDay: `Day ${i * 7 + 1}`,
      }),
    };

    const posts = Array.from({ length: Math.min(count, 10) }, (_, i) => {
      const t = templates[contentType](i);
      return { postNumber: i + 1, ...t, hashtags: (t.content.match(/#\w+/g) || []), cta: 'DM for more info' };
    });

    return { content: [{ type: 'text', text: JSON.stringify({
      contentType, location: loc, total: posts.length, posts,
      message: `Generated ${posts.length} ${contentType} posts. Review and use listing_publish to schedule them.`,
    }, null, 2) }] };
  }
);

server.tool(
  'leadgen_seller_valuation',
  'Create "What\'s your home worth?" outreach content for a target area to attract seller leads.',
  {
    targetArea: z.string().describe('Target neighborhood/area'),
    propertyType: z.string().optional().describe('Target property type'),
    message: z.string().optional().describe('Custom outreach message template'),
  },
  async ({ targetArea, propertyType, message }) => {
    const data = loadData();
    const soldProps = data.properties.filter(p =>
      (p.status === 'sold' || p.status === 'rented') &&
      p.location?.toLowerCase().includes(targetArea.toLowerCase())
    );

    const content = {
      social: `🏠 Homeowners in *${targetArea}* — do you know what your home is worth today?\n\n${soldProps.length > 0 ? `📈 Recent sales in your area:\n${soldProps.slice(0, 3).map(p => `• ${p.title} — sold for ${p.price?.toLocaleString()}`).join('\n')}` : `📈 The market in ${targetArea} is moving!`}\n\nGet a FREE home valuation — DM me your address!\n\n#HomeValue #${targetArea.replace(/[^a-zA-Z]/g, '')} #ThinkingOfSelling`,
      email: `Subject: What's Your Home Worth in ${targetArea}?\n\nHi,\n\nThe real estate market in ${targetArea} has been active lately.${soldProps.length > 0 ? ` Recent sales include:\n${soldProps.slice(0, 3).map(p => `• ${p.title} — ${p.price?.toLocaleString()}`).join('\n')}` : ''}\n\nWondering what your home might be worth? I offer free, no-obligation home valuations.\n\nJust reply with your address and I'll send you a detailed market analysis.\n\nBest regards`,
      whatsapp: message || `Hi! 👋\n\nAre you a homeowner in *${targetArea}*? The market has been very active recently.${soldProps.length > 0 ? `\n\n📊 Recent sales nearby:\n${soldProps.slice(0, 3).map(p => `• ${p.title} — ${p.price?.toLocaleString()}`).join('\n')}` : ''}\n\nWant to know what your home is worth? Send me your address for a *free valuation*!`,
    };

    return { content: [{ type: 'text', text: JSON.stringify({
      targetArea, recentSales: soldProps.slice(0, 5).map(p => ({ id: p.id, title: p.title, price: p.price, location: p.location })),
      outreachContent: content,
      message: `Seller valuation outreach created for ${targetArea}. Use listing_publish to distribute.`,
    }, null, 2) }] };
  }
);

server.tool(
  'leadgen_just_sold',
  'Create "Just Sold" campaigns from recently sold properties to attract seller leads in the same neighborhood.',
  {
    propertyId: z.string().describe('Property ID of the sold property'),
  },
  async ({ propertyId }) => {
    const data = loadData();
    const property = data.properties.find(p => p.id === propertyId);
    if (!property) return { content: [{ type: 'text', text: `Property ${propertyId} not found.` }] };
    if (property.status !== 'sold' && property.status !== 'rented') {
      return { content: [{ type: 'text', text: `Property ${propertyId} is not sold/rented (status: ${property.status}). Mark it as sold first.` }] };
    }

    const content = {
      social: `🎉 JUST SOLD in ${property.location}!\n\n🏠 ${property.title}\n💰 ${property.price?.toLocaleString()}\n📐 ${property.areaSqft || '?'} sqft | 🛏 ${property.bedrooms || '?'} Bed\n\nThinking of selling? Your home could be next! Get a FREE valuation — DM me your address.\n\n#JustSold #${property.location?.replace(/[^a-zA-Z]/g, '')} #RealEstate #Sold`,
      email: `Subject: Just Sold in ${property.location}!\n\nHi,\n\nI'm excited to share that we just closed on ${property.title} in ${property.location} for ${property.price?.toLocaleString()}!\n\nIf you're a homeowner in the area, the market is strong right now. I'd love to help you understand what your home might be worth.\n\nReply for a free, no-obligation home valuation.\n\nBest regards`,
      whatsapp: `🎉 *JUST SOLD!*\n\n🏠 ${property.title}\n📍 ${property.location}\n💰 ${property.price?.toLocaleString()}\n\nThinking of selling your home? The market in ${property.location} is hot! Reply for a *free home valuation*.`,
    };

    if (!data.campaigns) data.campaigns = [];
    if (!data.nextCampaignId) data.nextCampaignId = 1;
    const campaign = {
      id: generateId('C', data.nextCampaignId++),
      type: 'seller', name: `Just Sold: ${property.title}`,
      channels: ['social', 'email', 'whatsapp'], content,
      propertyId, location: property.location,
      leadsGenerated: 0, status: 'active',
      createdAt: new Date().toISOString(),
    };
    data.campaigns.push(campaign);
    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, campaign, property: { id: property.id, title: property.title, price: property.price, location: property.location },
      message: `"Just Sold" campaign created for ${property.title}. Publish to attract seller leads in ${property.location}.`,
    }, null, 2) }] };
  }
);

server.tool(
  'leadgen_market_report',
  'Generate a hyperlocal market report as a lead magnet for a specific area.',
  {
    location: z.string().describe('Area/neighborhood to analyze'),
    period: z.enum(['monthly', 'quarterly']).default('monthly').describe('Report period'),
  },
  async ({ location, period }) => {
    const data = loadData();
    const loc = location.toLowerCase();
    const areaProps = data.properties.filter(p => p.location?.toLowerCase().includes(loc));
    const available = areaProps.filter(p => p.status === 'available');
    const sold = areaProps.filter(p => p.status === 'sold' || p.status === 'rented');

    const avgPrice = areaProps.length > 0 ? Math.round(areaProps.reduce((s, p) => s + (p.price || 0), 0) / areaProps.length) : null;
    const avgSoldPrice = sold.length > 0 ? Math.round(sold.reduce((s, p) => s + (p.price || 0), 0) / sold.length) : null;
    const priceRange = areaProps.length > 0 ? { min: Math.min(...areaProps.map(p => p.price || Infinity)), max: Math.max(...areaProps.map(p => p.price || 0)) } : null;

    const report = {
      summary: `${period === 'monthly' ? 'Monthly' : 'Quarterly'} Market Report for ${location}`,
      stats: {
        totalListings: areaProps.length, activeListings: available.length,
        soldListings: sold.length, avgListingPrice: avgPrice, avgSoldPrice,
        priceRange,
      },
      insights: [
        available.length > sold.length ? `Buyer's market: more listings (${available.length}) than recent sales (${sold.length}).` : `Seller's market: strong demand with ${sold.length} recent sales.`,
        avgPrice && avgSoldPrice ? `Properties selling at ${Math.round((avgSoldPrice / avgPrice) * 100)}% of asking price.` : null,
        `${available.length} properties currently available in ${location}.`,
      ].filter(Boolean),
    };

    const shareableSnippet = `📊 *${location} Market Report*\n\n🏠 ${available.length} active listings\n✅ ${sold.length} recent sales\n${avgPrice ? `💰 Avg price: ${avgPrice.toLocaleString()}` : ''}\n${priceRange ? `📈 Range: ${priceRange.min.toLocaleString()} - ${priceRange.max.toLocaleString()}` : ''}\n\nWant the full report? DM me!\n\n#MarketReport #${location.replace(/[^a-zA-Z]/g, '')}`;

    return { content: [{ type: 'text', text: JSON.stringify({
      report, shareableSnippet,
      message: `Market report for ${location} generated. Share the snippet on social media as a lead magnet.`,
    }, null, 2) }] };
  }
);

server.tool(
  'leadgen_expired_fsbo',
  'Track expired listings and For Sale By Owner (FSBO) properties, and generate outreach messages.',
  {
    action: z.enum(['add', 'list', 'outreach']).describe('add = track new expired/FSBO, list = show all, outreach = generate message'),
    address: z.string().optional().describe('Property address (for add)'),
    ownerName: z.string().optional().describe('Owner name (for add)'),
    ownerPhone: z.string().optional().describe('Owner phone (for add)'),
    listingPrice: z.number().optional().describe('Original listing price (for add)'),
    expiryDate: z.string().optional().describe('Listing expiry date YYYY-MM-DD (for add)'),
    expiredId: z.string().optional().describe('Expired listing ID (for outreach)'),
  },
  async (params) => {
    const data = loadData();
    if (!data.expiredListings) data.expiredListings = [];
    if (!data.nextExpiredId) data.nextExpiredId = 1;

    if (params.action === 'add') {
      if (!params.address) return { content: [{ type: 'text', text: 'Address is required for adding an expired/FSBO listing.' }] };
      const entry = {
        id: generateId('EX', data.nextExpiredId++),
        address: params.address, ownerName: params.ownerName || '', ownerPhone: params.ownerPhone || '',
        listingPrice: params.listingPrice || null, expiryDate: params.expiryDate || null,
        outreachSent: false, convertedToLeadId: null, createdAt: new Date().toISOString(),
      };
      data.expiredListings.push(entry);
      saveData(data);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, entry, message: `Expired/FSBO listing tracked: ${params.address}` }, null, 2) }] };
    }

    if (params.action === 'list') {
      return { content: [{ type: 'text', text: JSON.stringify({
        total: data.expiredListings.length,
        listings: data.expiredListings.map(e => ({
          id: e.id, address: e.address, owner: e.ownerName, price: e.listingPrice,
          expired: e.expiryDate, outreachSent: e.outreachSent, converted: !!e.convertedToLeadId,
        })),
      }, null, 2) }] };
    }

    if (params.action === 'outreach') {
      const entry = params.expiredId
        ? data.expiredListings.find(e => e.id === params.expiredId)
        : data.expiredListings.find(e => !e.outreachSent);
      if (!entry) return { content: [{ type: 'text', text: 'No expired listing found for outreach.' }] };

      const daysSinceExpiry = entry.expiryDate
        ? Math.floor((Date.now() - new Date(entry.expiryDate).getTime()) / 86400000)
        : null;

      const message = `Hi ${entry.ownerName || 'there'},\n\nI noticed your property at ${entry.address}${daysSinceExpiry ? ` came off the market about ${daysSinceExpiry} days ago` : ' is no longer listed'}.\n\nThe market has shifted since then, and I believe a fresh approach could get you the result you're looking for.${entry.listingPrice ? ` Your original asking price of ${entry.listingPrice.toLocaleString()} was reasonable for the time — let me show you what comparable homes are selling for now.` : ''}\n\nI'd love to offer a complimentary market analysis to see what we can do. No pressure, just information.\n\nWould you be open to a quick chat?`;

      entry.outreachSent = true;
      saveData(data);

      return { content: [{ type: 'text', text: JSON.stringify({
        entry: { id: entry.id, address: entry.address, owner: entry.ownerName },
        outreachMessage: message,
        message: `Outreach message generated for ${entry.address}. Send to the owner via their preferred channel.`,
      }, null, 2) }] };
    }

    return { content: [{ type: 'text', text: 'Invalid action.' }] };
  }
);

server.tool(
  'leadgen_referral_create',
  'Set up a referral tracking entry for a satisfied client who may refer others.',
  {
    referrerId: z.string().describe('Lead ID of the referring client'),
    referralCode: z.string().optional().describe('Custom referral code (auto-generated if omitted)'),
  },
  async ({ referrerId, referralCode }) => {
    const data = loadData();
    if (!data.referrals) data.referrals = [];
    const lead = data.leads.find(l => l.id === referrerId);
    if (!lead) return { content: [{ type: 'text', text: `Lead ${referrerId} not found.` }] };

    const code = referralCode || `REF-${lead.name.split(' ')[0].toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const existing = data.referrals.find(r => r.referrerId === referrerId);
    if (existing) return { content: [{ type: 'text', text: JSON.stringify({
      existing: true, referral: existing,
      message: `${lead.name} already has a referral code: ${existing.code}`,
    }, null, 2) }] };

    const referral = {
      code, referrerId, referrerName: lead.name,
      referredLeads: [], createdAt: new Date().toISOString(),
    };
    data.referrals.push(referral);
    saveData(data);

    const shareMessage = `Hey! I had an amazing experience finding my home with this agent. If you're looking to buy or sell, use my code *${code}* when you reach out. They'll take great care of you! 🏠`;

    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, referral, shareableMessage: shareMessage,
      message: `Referral code ${code} created for ${lead.name}. Share the message with them to forward to friends.`,
    }, null, 2) }] };
  }
);

server.tool(
  'leadgen_referral_stats',
  'Track referral program performance.',
  {},
  async () => {
    const data = loadData();
    if (!data.referrals) data.referrals = [];
    const totalReferrals = data.referrals.reduce((s, r) => s + r.referredLeads.length, 0);
    const converted = data.referrals.reduce((s, r) => {
      return s + r.referredLeads.filter(lid => {
        const l = data.leads.find(le => le.id === lid);
        return l && (l.status === 'closed-won' || l.status === 'showing' || l.status === 'negotiation');
      }).length;
    }, 0);

    return { content: [{ type: 'text', text: JSON.stringify({
      totalReferrers: data.referrals.length, totalReferrals, convertedReferrals: converted,
      topReferrers: data.referrals.sort((a, b) => b.referredLeads.length - a.referredLeads.length).slice(0, 5)
        .map(r => ({ name: r.referrerName, code: r.code, referred: r.referredLeads.length })),
    }, null, 2) }] };
  }
);

server.tool(
  'leadgen_stats',
  'Overview of all lead generation activity and ROI.',
  {
    period: z.enum(['week', 'month', 'all']).default('all').describe('Time period'),
  },
  async ({ period }) => {
    const data = loadData();
    if (!data.campaigns) data.campaigns = [];
    if (!data.referrals) data.referrals = [];

    let leads = data.leads;
    if (period !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (period === 'week' ? 7 : 30));
      const cutoffStr = cutoff.toISOString();
      leads = leads.filter(l => l.createdAt >= cutoffStr);
    }

    const bySource = {};
    for (const l of leads) {
      const src = l.source || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    }

    const totalLeads = leads.length;
    const showingLeads = leads.filter(l => ['showing', 'negotiation', 'closed-won'].includes(l.status)).length;
    const closedWon = leads.filter(l => l.status === 'closed-won').length;

    return { content: [{ type: 'text', text: JSON.stringify({
      period,
      leadsGenerated: { total: totalLeads, bySource },
      campaigns: { total: data.campaigns.length, active: data.campaigns.filter(c => c.status === 'active').length },
      referrals: { total: data.referrals.reduce((s, r) => s + r.referredLeads.length, 0) },
      conversion: {
        leadToShowing: totalLeads > 0 ? `${((showingLeads / totalLeads) * 100).toFixed(1)}%` : '0%',
        showingToClose: showingLeads > 0 ? `${((closedWon / showingLeads) * 100).toFixed(1)}%` : '0%',
      },
      topSource: Object.entries(bySource).sort((a, b) => b[1] - a[1])[0] || null,
    }, null, 2) }] };
  }
);

// ── Listing Marketing Tools (Phase 4) ─────────────────────────────────────

server.tool(
  'listing_generate',
  'Generate professional marketing content for a property listing.',
  {
    propertyId: z.string().describe('Property ID'),
    contentType: z.enum(['description', 'social_post', 'email', 'neighborhood_guide', 'flyer']).describe('Type of content'),
  },
  async ({ propertyId, contentType }) => {
    const data = loadData();
    const property = data.properties.find(p => p.id === propertyId);
    if (!property) return { content: [{ type: 'text', text: `Property ${propertyId} not found.` }] };

    const p = property;
    const amenityStr = (p.amenities || []).join(', ') || 'modern amenities';
    let generated = '';

    switch (contentType) {
      case 'description':
        generated = `*${p.title}*\n\n` +
          `Welcome to this stunning ${p.type || 'property'} in the heart of ${p.location}. ` +
          `${p.bedrooms ? `Featuring ${p.bedrooms} spacious bedrooms` : 'Featuring well-designed living spaces'}${p.bathrooms ? ` and ${p.bathrooms} modern bathrooms` : ''}, ` +
          `this ${p.areaSqft ? `${p.areaSqft} sqft` : 'beautifully designed'} home offers the perfect blend of comfort and style.\n\n` +
          `*Highlights:*\n` +
          `📍 Location: ${p.location}\n` +
          `💰 Price: ${p.price?.toLocaleString()}\n` +
          `${p.bedrooms ? `🛏 Bedrooms: ${p.bedrooms}\n` : ''}` +
          `${p.bathrooms ? `🚿 Bathrooms: ${p.bathrooms}\n` : ''}` +
          `${p.areaSqft ? `📐 Area: ${p.areaSqft} sqft\n` : ''}` +
          `${p.floor ? `🏢 Floor: ${p.floor}\n` : ''}` +
          `${p.furnishing ? `🪑 Furnishing: ${p.furnishing}\n` : ''}` +
          `✨ Amenities: ${amenityStr}\n` +
          `${p.mlsId ? `📋 MLS: ${p.mlsId}\n` : ''}` +
          `\n${p.description || 'Schedule a visit today to experience this property firsthand!'}`;
        break;
      case 'social_post':
        generated = `🏠 NEW LISTING!\n\n` +
          `${p.title}\n` +
          `📍 ${p.location}\n` +
          `💰 ${p.price?.toLocaleString()}\n` +
          `${p.bedrooms ? `🛏 ${p.bedrooms} Bed` : ''}${p.bathrooms ? ` | 🚿 ${p.bathrooms} Bath` : ''}${p.areaSqft ? ` | 📐 ${p.areaSqft} sqft` : ''}\n\n` +
          `✨ ${amenityStr}\n\n` +
          `DM for details or to schedule a visit!\n\n` +
          `#NewListing #${p.location?.replace(/[^a-zA-Z]/g, '')} #RealEstate #${(p.type || 'home').replace(/[^a-zA-Z]/g, '')} #PropertyForSale`;
        break;
      case 'email':
        generated = `Subject: New Listing: ${p.title} — ${p.price?.toLocaleString()}\n\n` +
          `Hi,\n\nI'm excited to share a new listing that I think you'll love:\n\n` +
          `*${p.title}*\n${p.location} | ${p.price?.toLocaleString()}\n` +
          `${p.bedrooms || '?'} Bed | ${p.bathrooms || '?'} Bath | ${p.areaSqft || '?'} sqft\n\n` +
          `${p.description || `This ${p.type} features ${amenityStr} and is perfectly located in ${p.location}.`}\n\n` +
          `Interested? Reply to schedule a private showing.\n\nBest regards`;
        break;
      case 'neighborhood_guide':
        generated = `📍 *Neighborhood Guide: ${p.location}*\n\n` +
          `Thinking about living in ${p.location}? Here's what you need to know:\n\n` +
          `🏠 *Housing*: Diverse options from apartments to villas. Average prices range based on size and amenities.\n\n` +
          `🛒 *Conveniences*: Close to shopping, dining, and essential services.\n\n` +
          `🚗 *Connectivity*: Well-connected by major roads and public transport.\n\n` +
          `🌳 *Lifestyle*: Great parks, recreational facilities, and community spaces.\n\n` +
          `📊 *Market Snapshot*: Active market with good appreciation potential.\n\n` +
          `Want to explore ${p.location}? I can show you the best properties in the area!`;
        break;
      case 'flyer':
        generated = `═══════════════════════════════════\n` +
          `        ${(p.listingType || 'sale').toUpperCase() === 'SALE' ? 'FOR SALE' : 'FOR RENT'}\n` +
          `═══════════════════════════════════\n\n` +
          `  ${p.title}\n\n` +
          `  📍 ${p.location}\n` +
          `  💰 ${p.price?.toLocaleString()}\n\n` +
          `  ${p.bedrooms || '?'} BED | ${p.bathrooms || '?'} BATH | ${p.areaSqft || '?'} SQFT\n\n` +
          `  ✨ ${amenityStr}\n\n` +
          `  ${p.description || 'Beautiful property in prime location.'}\n\n` +
          `  ${p.mlsId ? `MLS: ${p.mlsId}\n\n` : ''}` +
          `═══════════════════════════════════\n` +
          `  CONTACT US TODAY FOR A SHOWING!\n` +
          `═══════════════════════════════════`;
        break;
    }

    return { content: [{ type: 'text', text: JSON.stringify({
      propertyId, contentType, content: generated, generatedAt: new Date().toISOString(),
      message: `${contentType} generated for ${p.title}. Review and use listing_publish to distribute.`,
    }, null, 2) }] };
  }
);

server.tool(
  'listing_publish',
  'Publish listing content to a channel (social media via FreeTools, email via Gmail, or WhatsApp).',
  {
    channel: z.enum(['social', 'email', 'whatsapp']).describe('Publication channel'),
    content: z.string().describe('Content to publish'),
    recipients: z.array(z.string()).optional().describe('For email: email addresses. For WhatsApp: lead IDs.'),
    propertyId: z.string().optional().describe('Property ID (for tracking)'),
  },
  async ({ channel, content, recipients, propertyId }) => {
    const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:5151';
    const CHAT_ID = process.env.CHAT_ID;

    if (channel === 'social') {
      // Publish via FreeTools — requires connected social accounts
      try {
        const resp = await fetch(`${BOT_API_URL}/freetools/list-accounts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: CHAT_ID }),
        });
        const accounts = await resp.json();
        if (!accounts.accounts?.length) {
          return { content: [{ type: 'text', text: 'No social media accounts connected. Use the Marketing Agent to connect accounts first.' }] };
        }
        const accountIds = accounts.accounts.map(a => a.id);
        const pubResp = await fetch(`${BOT_API_URL}/freetools/publish-now`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: CHAT_ID, accountIds, caption: content }),
        });
        const result = await pubResp.json();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, channel: 'social', result, message: 'Posted to connected social media accounts.' }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Social publish failed: ${err.message}. The content has been generated — you can copy and post it manually.` }] };
      }
    }

    if (channel === 'email') {
      if (!recipients?.length) return { content: [{ type: 'text', text: 'Recipients (email addresses) required for email publishing.' }] };
      const results = [];
      for (const email of recipients) {
        try {
          const lines = content.split('\n');
          const subjectLine = lines.find(l => l.startsWith('Subject:'))?.replace('Subject: ', '') || 'New Property Listing';
          const body = lines.filter(l => !l.startsWith('Subject:')).join('\n').trim();
          await fetch(`${BOT_API_URL}/gmail/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: CHAT_ID, to: email, subject: subjectLine, body }),
          });
          results.push({ email, sent: true });
        } catch (err) {
          results.push({ email, sent: false, error: err.message });
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, channel: 'email', results, message: `Sent to ${results.filter(r => r.sent).length}/${recipients.length} recipients.` }, null, 2) }] };
    }

    if (channel === 'whatsapp') {
      // For WhatsApp, return the formatted content — the agent will forward it
      return { content: [{ type: 'text', text: JSON.stringify({
        channel: 'whatsapp', content,
        message: 'WhatsApp content ready. Forward this to your leads or broadcast list.',
      }, null, 2) }] };
    }

    return { content: [{ type: 'text', text: 'Invalid channel.' }] };
  }
);

server.tool(
  'listing_campaign',
  'Create a multi-channel marketing campaign for a property. Generates content for all channels and finds matching leads.',
  {
    propertyId: z.string().describe('Property ID'),
    channels: z.array(z.enum(['social', 'email', 'whatsapp'])).default(['social', 'email']).describe('Channels to target'),
    targetLeadCategory: z.enum(['hot', 'warm', 'cold']).optional().describe('Filter matching leads by category'),
  },
  async ({ propertyId, channels, targetLeadCategory }) => {
    const data = loadData();
    const property = data.properties.find(p => p.id === propertyId);
    if (!property) return { content: [{ type: 'text', text: `Property ${propertyId} not found.` }] };

    // Find matching leads
    let matchingLeads = data.leads.filter(l => l.status !== 'closed-won' && l.status !== 'closed-lost' && l.type === 'buyer');
    if (targetLeadCategory) matchingLeads = matchingLeads.filter(l => scoreCategory(scoreLead(l)) === targetLeadCategory);
    matchingLeads = matchingLeads.filter(l => {
      const { score } = matchScore(l, property);
      return score > 0;
    }).map(l => {
      const { score, reasons } = matchScore(l, property);
      return { id: l.id, name: l.name, email: l.email, phone: l.phone, matchScore: score, reasons };
    }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 20);

    const p = property;
    const preview = {};
    if (channels.includes('social')) {
      preview.social = `🏠 NEW LISTING: ${p.title}\n📍 ${p.location} | 💰 ${p.price?.toLocaleString()}\n${p.bedrooms || '?'} Bed | ${p.areaSqft || '?'} sqft\nDM for details! #RealEstate`;
    }
    if (channels.includes('email')) {
      preview.email = `Subject: Perfect Match: ${p.title}\n\nBased on your preferences, this property is a great fit:\n${p.title} — ${p.location} — ${p.price?.toLocaleString()}`;
    }
    if (channels.includes('whatsapp')) {
      preview.whatsapp = `Hi! I found a property that matches what you're looking for:\n\n*${p.title}*\n📍 ${p.location}\n💰 ${p.price?.toLocaleString()}\n\nWant to schedule a visit?`;
    }

    return { content: [{ type: 'text', text: JSON.stringify({
      propertyId, property: { title: p.title, location: p.location, price: p.price },
      preview, channels, matchingLeads,
      message: `Campaign preview ready for ${p.title}. ${matchingLeads.length} matching leads found. Review and use listing_publish for each channel to go live.`,
    }, null, 2) }] };
  }
);

// ── Listing Video Tools ───────────────────────────────────────────────────

server.tool(
  'listing_video_create',
  'Generate a video walkthrough from property listing photos. Supports slideshow (Ken Burns pan/zoom), narrated tour, or social clip styles.',
  {
    propertyId: z.string().describe('Property ID'),
    style: z.enum(['slideshow', 'narrated_tour', 'social_clip']).default('slideshow').describe('Video style'),
    duration: z.number().optional().describe('Target duration in seconds (default: 30 for social_clip, 60 for slideshow, 90 for narrated_tour)'),
  },
  async ({ propertyId, style, duration }) => {
    const { execSync } = require('child_process');

    const data = loadData();
    const property = data.properties.find(p => p.id === propertyId);
    if (!property) return { content: [{ type: 'text', text: `Property ${propertyId} not found.` }] };

    // Find property images in workspace
    const workspaceDir = path.dirname(DATA_PATH);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    let images = [];

    const searchDirs = [workspaceDir, path.join(workspaceDir, 'images'), path.join(workspaceDir, propertyId)];
    for (const dir of searchDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir)
            .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()))
            .map(f => path.join(dir, f));
          images.push(...files);
        }
      } catch (_) {}
    }

    if (images.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({
        error: true,
        message: `No images found for property ${propertyId}. Send property photos via WhatsApp first, then try again.`,
        tip: 'Send photos in the chat, then run this tool again. Images should be in the workspace.',
      }, null, 2) }] };
    }

    images = images.slice(0, 20);

    const p = property;
    const defaultDuration = style === 'social_clip' ? 30 : style === 'narrated_tour' ? 90 : 60;
    const totalDuration = duration || defaultDuration;
    const perImage = Math.max(3, Math.floor(totalDuration / images.length));

    const titleText = (p.title || 'Property Tour').replace(/'/g, "\\'").replace(/:/g, '\\:');
    const priceText = p.price ? p.price.toLocaleString() : '';
    const detailsText = [p.bedrooms ? `${p.bedrooms} Bed` : null, p.bathrooms ? `${p.bathrooms} Bath` : null, p.areaSqft ? `${p.areaSqft} sqft` : null].filter(Boolean).join(' | ');
    const locationText = (p.location || '').replace(/'/g, "\\'").replace(/:/g, '\\:');

    const outputPath = path.join(workspaceDir, `${propertyId}-tour-${style}.mp4`);

    try {
      if (images.length === 1) {
        // Single image: simple zoom with overlays
        const cmd = `ffmpeg -y -loop 1 -t ${totalDuration} -i "${images[0]}" -filter_complex "` +
          `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
          `zoompan=z='1+0.0008*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalDuration * 25}:s=1920x1080:fps=25,` +
          `drawtext=text='${titleText}':fontsize=48:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.4:enable='lt(t\\,4)',` +
          `drawtext=text='${priceText}':fontsize=56:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.5:enable='lt(t\\,4)',` +
          `format=yuv420p" -c:v libx264 -preset fast -crf 23 -movflags +faststart -an "${outputPath}" 2>&1`;
        execSync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
      } else {
        // Multiple images: Ken Burns + crossfade + text overlays
        const inputs = images.map(img => `-loop 1 -t ${perImage} -i "${img}"`).join(' ');

        // Each image gets zoompan
        const zooms = images.map((_, i) => {
          const zDir = i % 2 === 0 ? '1+0.001*on' : '1.3-0.001*on';
          const px = i % 3 === 0 ? 'iw/2-(iw/zoom/2)' : i % 3 === 1 ? '0' : 'iw-iw/zoom';
          return `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,zoompan=z='${zDir}':x='${px}':y='ih/2-(ih/zoom/2)':d=${perImage * 25}:s=1920x1080:fps=25[v${i}]`;
        }).join('; ');

        // Crossfade between clips
        let prev = 'v0';
        const xfades = [];
        for (let i = 1; i < images.length; i++) {
          const offset = i * perImage - i; // account for 1s overlaps
          const out = i === images.length - 1 ? 'merged' : `xf${i}`;
          xfades.push(`[${prev}][v${i}]xfade=transition=fade:duration=1:offset=${offset}[${out}]`);
          prev = out;
        }

        // Text overlays
        const totalVidDuration = images.length * perImage - (images.length - 1);
        const ctaOffset = Math.max(0, totalVidDuration - 4);
        const overlays =
          `,drawtext=text='${titleText}':fontsize=48:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.35:enable='lt(t\\,4)'` +
          (priceText ? `,drawtext=text='${priceText}':fontsize=56:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.45:enable='lt(t\\,4)'` : '') +
          (detailsText ? `,drawtext=text='${detailsText}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.55:enable='lt(t\\,4)'` : '') +
          (locationText ? `,drawtext=text='${locationText}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h*0.63:enable='lt(t\\,4)'` : '') +
          `,drawtext=text='Contact us for a showing!':fontsize=40:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.45:enable='gt(t\\,${ctaOffset})'`;

        const filterComplex = `${zooms}; ${xfades.join('; ')}; [merged]${overlays},format=yuv420p[final]`;
        const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[final]" -c:v libx264 -preset fast -crf 23 -movflags +faststart -an "${outputPath}" 2>&1`;
        execSync(cmd, { timeout: 120000, maxBuffer: 50 * 1024 * 1024 });
      }

      const sizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);

      // Generate narration script for narrated_tour style
      let narrationScript = null;
      if (style === 'narrated_tour') {
        narrationScript = `Welcome to ${p.title || 'this beautiful property'}.\n\n` +
          `Located in ${p.location || 'a prime area'}, this ${p.type || 'property'} features ${detailsText || 'spacious living'}.\n\n` +
          (p.description || `Enjoy ${(p.amenities || []).join(', ') || 'modern amenities'} in this ${p.furnishing || 'well-appointed'} home.`) +
          `${priceText ? `\n\nListed at ${priceText}.` : ''}` +
          `\n\nContact us today to schedule your private showing!`;
      }

      return { content: [{ type: 'text', text: JSON.stringify({
        success: true, videoPath: outputPath, sizeMB,
        property: { id: p.id, title: p.title, location: p.location, price: p.price },
        style, imagesUsed: images.length, durationSeconds: totalDuration,
        narrationScript,
        message: `Video tour created for ${p.title} (${sizeMB}MB, ${images.length} photos, ${style}). The file will be sent automatically.${narrationScript ? ' Narration script included for voiceover.' : ''}`,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({
        error: true, message: `Video generation failed: ${err.message}`,
        imagesFound: images.length, tip: 'Check that ffmpeg is installed and images are valid JPG/PNG files.',
      }, null, 2) }] };
    }
  }
);

// ── Property Search & MLS Tools (Phase 5) ─────────────────────────────────

server.tool(
  'mls_search',
  'Search MLS listings via RESO Web API. Returns active listings matching filters.',
  {
    location: z.string().optional().describe('City, neighborhood, or ZIP code'),
    priceMin: z.number().optional().describe('Minimum price'),
    priceMax: z.number().optional().describe('Maximum price'),
    bedrooms: z.number().optional().describe('Minimum bedrooms'),
    bathrooms: z.number().optional().describe('Minimum bathrooms'),
    propertyType: z.string().optional().describe('Single Family, Townhouse, Condo, etc.'),
    listingType: z.enum(['sale', 'rent']).default('sale').describe('For sale or rent'),
    limit: z.number().default(10).describe('Max results'),
  },
  async (params) => {
    const MLS_API_URL = process.env.MLS_API_URL;
    const MLS_API_TOKEN = process.env.MLS_API_TOKEN;

    if (!MLS_API_URL || !MLS_API_TOKEN) {
      // Fallback to local property data
      const data = loadData();
      let props = data.properties.filter(p => p.status === 'available');
      if (params.location) props = props.filter(p => p.location?.toLowerCase().includes(params.location.toLowerCase()));
      if (params.priceMin) props = props.filter(p => p.price >= params.priceMin);
      if (params.priceMax) props = props.filter(p => p.price <= params.priceMax);
      if (params.bedrooms) props = props.filter(p => p.bedrooms >= params.bedrooms);
      if (params.propertyType) props = props.filter(p => p.type?.toLowerCase().includes(params.propertyType.toLowerCase()));
      if (params.listingType) props = props.filter(p => p.listingType === params.listingType);
      return { content: [{ type: 'text', text: JSON.stringify({
        source: 'local', note: 'MLS API not configured — showing local inventory only. Set MLS_API_URL and MLS_API_TOKEN for MLS search.',
        total: Math.min(props.length, params.limit),
        listings: props.slice(0, params.limit).map(p => ({
          id: p.id, title: p.title, type: p.type, location: p.location,
          price: p.price, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
          areaSqft: p.areaSqft, listingType: p.listingType,
        })),
      }, null, 2) }] };
    }

    try {
      const filters = ["StandardStatus eq 'Active'"];
      if (params.priceMin) filters.push(`ListPrice ge ${params.priceMin}`);
      if (params.priceMax) filters.push(`ListPrice le ${params.priceMax}`);
      if (params.bedrooms) filters.push(`BedroomsTotal ge ${params.bedrooms}`);
      if (params.bathrooms) filters.push(`BathroomsTotalInteger ge ${params.bathrooms}`);
      if (params.location) filters.push(`City eq '${params.location}'`);

      const url = `${MLS_API_URL}/odata/Property?$filter=${filters.join(' and ')}&$top=${params.limit}&$orderby=ListPrice desc&$select=ListingKey,ListPrice,LivingArea,BedroomsTotal,BathroomsTotalInteger,City,StreetName,PropertyType,StandardStatus`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${MLS_API_TOKEN}`, 'Accept': 'application/json' },
      });
      const result = await resp.json();
      const listings = (result.value || []).map(l => ({
        mlsId: l.ListingKey, price: l.ListPrice, areaSqft: l.LivingArea,
        bedrooms: l.BedroomsTotal, bathrooms: l.BathroomsTotalInteger,
        location: `${l.StreetName || ''}, ${l.City || ''}`, type: l.PropertyType,
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ source: 'MLS', total: listings.length, listings }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `MLS search failed: ${err.message}` }] };
    }
  }
);

server.tool(
  'neighborhood_data',
  'Get Walk Score, school ratings, and neighborhood info for a location.',
  {
    address: z.string().optional().describe('Street address'),
    lat: z.number().optional().describe('Latitude'),
    lng: z.number().optional().describe('Longitude'),
  },
  async ({ address, lat, lng }) => {
    const WALKSCORE_API_KEY = process.env.WALKSCORE_API_KEY;
    const GREATSCHOOLS_API_KEY = process.env.GREATSCHOOLS_API_KEY;
    const results = { address: address || `${lat},${lng}` };

    if (WALKSCORE_API_KEY && address) {
      try {
        const url = `https://api.walkscore.com/score?format=json&address=${encodeURIComponent(address)}&wsapikey=${WALKSCORE_API_KEY}`;
        const resp = await fetch(url);
        const ws = await resp.json();
        results.walkScore = { score: ws.walkscore, description: ws.description, transitScore: ws.transit?.score, bikeScore: ws.bike?.score };
      } catch (err) {
        results.walkScore = { error: err.message };
      }
    } else {
      results.walkScore = { note: 'Walk Score API not configured. Set WALKSCORE_API_KEY.' };
    }

    if (GREATSCHOOLS_API_KEY && (lat || address)) {
      try {
        const url = lat
          ? `https://gs-api.greatschools.org/nearby-schools?lat=${lat}&lon=${lng}&limit=5`
          : `https://gs-api.greatschools.org/search/schools?q=${encodeURIComponent(address)}&limit=5`;
        const resp = await fetch(url, {
          headers: { 'x-api-key': GREATSCHOOLS_API_KEY },
        });
        const schools = await resp.json();
        results.schools = (schools.schools || schools || []).slice(0, 5).map(s => ({
          name: s.name, rating: s.rating, type: s.type, distance: s.distance,
        }));
      } catch (err) {
        results.schools = { error: err.message };
      }
    } else {
      results.schools = { note: 'GreatSchools API not configured. Set GREATSCHOOLS_API_KEY.' };
    }

    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  'property_compare',
  'Side-by-side comparison of 2-3 properties.',
  {
    propertyIds: z.array(z.string()).min(2).max(3).describe('Property IDs to compare'),
  },
  async ({ propertyIds }) => {
    const data = loadData();
    const props = propertyIds.map(id => data.properties.find(p => p.id === id)).filter(Boolean);
    if (props.length < 2) return { content: [{ type: 'text', text: 'Need at least 2 valid property IDs to compare.' }] };

    const comparison = {
      properties: props.map(p => ({
        id: p.id, title: p.title, location: p.location, price: p.price,
        pricePerSqft: p.areaSqft ? Math.round(p.price / p.areaSqft) : null,
        bedrooms: p.bedrooms, bathrooms: p.bathrooms, areaSqft: p.areaSqft,
        floor: p.floor, furnishing: p.furnishing, amenities: p.amenities,
        listingType: p.listingType, status: p.status, showings: p.showingsCount,
      })),
      bestValue: props.reduce((best, p) => {
        const ppSqft = p.areaSqft ? p.price / p.areaSqft : Infinity;
        const bestPpSqft = best.areaSqft ? best.price / best.areaSqft : Infinity;
        return ppSqft < bestPpSqft ? p : best;
      }).id,
    };

    return { content: [{ type: 'text', text: JSON.stringify(comparison, null, 2) }] };
  }
);

// ── CMA & Market Intelligence Tools (Phase 6) ────────────────────────────

server.tool(
  'get_comparable_sales',
  'Fetch recently sold comparable properties for CMA generation.',
  {
    location: z.string().describe('Location/area to search comps'),
    propertyType: z.string().optional().describe('Property type to match'),
    priceRange: z.number().optional().describe('Subject price — comps within ±20%'),
    bedrooms: z.number().optional().describe('Target bedroom count'),
  },
  async (params) => {
    const ATTOM_API_KEY = process.env.ATTOM_API_KEY;
    const data = loadData();

    // Local comps from internal data
    const loc = params.location.toLowerCase();
    let comps = data.properties.filter(p =>
      (p.status === 'sold' || p.status === 'rented') && p.location?.toLowerCase().includes(loc)
    );
    if (params.propertyType) comps = comps.filter(p => p.type?.toLowerCase().includes(params.propertyType.toLowerCase()));
    if (params.priceRange) {
      const min = params.priceRange * 0.8, max = params.priceRange * 1.2;
      comps = comps.filter(p => p.price >= min && p.price <= max);
    }
    if (params.bedrooms) comps = comps.filter(p => p.bedrooms && Math.abs(p.bedrooms - params.bedrooms) <= 1);

    const localComps = comps.slice(0, 10).map(p => ({
      source: 'local', id: p.id, title: p.title, location: p.location,
      price: p.price, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
      areaSqft: p.areaSqft, pricePerSqft: p.areaSqft ? Math.round(p.price / p.areaSqft) : null,
    }));

    // ATTOM API comps if available
    let attomComps = [];
    if (ATTOM_API_KEY) {
      try {
        const url = `https://api.gateway.attomdata.com/property/v2/salescomparables/address?address=${encodeURIComponent(params.location)}&radius=1&propertytype=${params.propertyType || 'SFR'}&limit=5`;
        const resp = await fetch(url, {
          headers: { 'apikey': ATTOM_API_KEY, 'Accept': 'application/json' },
        });
        const result = await resp.json();
        attomComps = (result.property || []).map(p => ({
          source: 'ATTOM', address: p.address?.oneLine, price: p.sale?.amount?.saleAmt,
          bedrooms: p.building?.rooms?.beds, bathrooms: p.building?.rooms?.bathsFull,
          areaSqft: p.building?.size?.livingSize, saleDate: p.sale?.amount?.saleRecDate,
        }));
      } catch (err) {
        attomComps = [{ error: err.message }];
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify({
      location: params.location,
      localComps: { total: localComps.length, comps: localComps },
      attomComps: ATTOM_API_KEY ? { total: attomComps.length, comps: attomComps } : { note: 'ATTOM API not configured. Set ATTOM_API_KEY for external comp data.' },
    }, null, 2) }] };
  }
);

server.tool(
  'generate_cma',
  'Generate a Comparative Market Analysis (CMA) report for a property.',
  {
    address: z.string().describe('Subject property address'),
    propertyType: z.string().optional().describe('Property type'),
    bedrooms: z.number().optional().describe('Bedrooms'),
    bathrooms: z.number().optional().describe('Bathrooms'),
    areaSqft: z.number().optional().describe('Living area in sqft'),
    condition: z.string().optional().describe('Property condition (excellent, good, fair, poor)'),
  },
  async (params) => {
    const data = loadData();
    const loc = params.address.toLowerCase();

    // Find comparable sold properties
    let comps = data.properties.filter(p =>
      (p.status === 'sold' || p.status === 'rented') &&
      p.location?.toLowerCase().includes(loc.split(',')[0].trim().toLowerCase())
    );
    if (params.propertyType) comps = comps.filter(p => p.type?.toLowerCase().includes(params.propertyType.toLowerCase()));

    const compAnalysis = comps.slice(0, 5).map(c => {
      const adjustments = [];
      let adjustedPrice = c.price || 0;

      // Sqft adjustment
      if (params.areaSqft && c.areaSqft) {
        const diff = params.areaSqft - c.areaSqft;
        const pricePerSqft = c.price / c.areaSqft;
        const adj = Math.round(diff * pricePerSqft * 0.5);
        adjustments.push({ factor: 'sqft difference', amount: adj });
        adjustedPrice += adj;
      }

      // Bedroom adjustment
      if (params.bedrooms && c.bedrooms) {
        const diff = params.bedrooms - c.bedrooms;
        const adj = diff * Math.round((c.price || 0) * 0.03);
        if (diff !== 0) adjustments.push({ factor: 'bedroom count', amount: adj });
        adjustedPrice += adj;
      }

      return {
        id: c.id, title: c.title, location: c.location, salePrice: c.price,
        bedrooms: c.bedrooms, areaSqft: c.areaSqft, adjustments, adjustedPrice: Math.round(adjustedPrice),
      };
    });

    const adjustedPrices = compAnalysis.map(c => c.adjustedPrice).filter(p => p > 0);
    const avgAdjusted = adjustedPrices.length > 0 ? Math.round(adjustedPrices.reduce((s, p) => s + p, 0) / adjustedPrices.length) : null;

    const estimatedRange = avgAdjusted ? {
      low: Math.round(avgAdjusted * 0.95),
      mid: avgAdjusted,
      high: Math.round(avgAdjusted * 1.05),
    } : null;

    // Check mortgage rates
    let mortgageRate = null;
    const FRED_API_KEY = process.env.FRED_API_KEY;
    if (FRED_API_KEY) {
      try {
        const resp = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=MORTGAGE30US&sort_order=desc&limit=1&api_key=${FRED_API_KEY}&file_type=json`);
        const fred = await resp.json();
        mortgageRate = fred.observations?.[0]?.value ? parseFloat(fred.observations[0].value) : null;
      } catch (_) {}
    }

    const monthlyPayment = estimatedRange && mortgageRate
      ? Math.round((estimatedRange.mid * 0.8 * (mortgageRate / 100 / 12)) / (1 - Math.pow(1 + mortgageRate / 100 / 12, -360)))
      : null;

    return { content: [{ type: 'text', text: JSON.stringify({
      subject: { address: params.address, type: params.propertyType, bedrooms: params.bedrooms, bathrooms: params.bathrooms, areaSqft: params.areaSqft, condition: params.condition },
      comparables: compAnalysis,
      estimatedRange,
      mortgageContext: mortgageRate ? { rate30yr: `${mortgageRate}%`, estimatedMonthlyPayment: monthlyPayment, note: '80% LTV, 30-year fixed' } : { note: 'FRED API not configured for mortgage rates. Set FRED_API_KEY.' },
      disclaimer: 'This is an AI-generated estimate based on available comparable data. Consult a licensed appraiser for a formal valuation.',
      message: compAnalysis.length > 0
        ? `CMA for ${params.address}: estimated value ${estimatedRange ? `${estimatedRange.low.toLocaleString()} - ${estimatedRange.high.toLocaleString()}` : 'insufficient data'} based on ${compAnalysis.length} comparables.`
        : 'Insufficient comparable sales data for a reliable CMA. Consider adding more sold properties or connecting ATTOM API.',
    }, null, 2) }] };
  }
);

server.tool(
  'get_mortgage_rates',
  'Get current mortgage rates from FRED (Federal Reserve Economic Data).',
  {
    type: z.enum(['30yr_fixed', '15yr_fixed']).default('30yr_fixed').describe('Mortgage type'),
  },
  async ({ type }) => {
    const FRED_API_KEY = process.env.FRED_API_KEY;
    if (!FRED_API_KEY) {
      return { content: [{ type: 'text', text: 'FRED API not configured. Set FRED_API_KEY for mortgage rate data. Current approximate rates: 30yr fixed ~6.5-7%, 15yr fixed ~5.5-6%.' }] };
    }

    const seriesId = type === '15yr_fixed' ? 'MORTGAGE15US' : 'MORTGAGE30US';
    try {
      const resp = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=5&api_key=${FRED_API_KEY}&file_type=json`);
      const result = await resp.json();
      const observations = (result.observations || []).map(o => ({ date: o.date, rate: parseFloat(o.value) }));
      const current = observations[0];

      return { content: [{ type: 'text', text: JSON.stringify({
        type: type === '15yr_fixed' ? '15-Year Fixed' : '30-Year Fixed',
        currentRate: current ? `${current.rate}%` : 'unavailable',
        asOf: current?.date,
        recentTrend: observations.slice(0, 5),
        estimatePayment: (price) => {
          if (!current) return null;
          const principal = price * 0.8;
          const r = current.rate / 100 / 12;
          const n = type === '15yr_fixed' ? 180 : 360;
          return Math.round((principal * r) / (1 - Math.pow(1 + r, -n)));
        },
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Failed to fetch mortgage rates: ${err.message}` }] };
    }
  }
);

server.tool(
  'valuation_estimate',
  'Generate an AI-powered home value estimate using comparable sales data.',
  {
    address: z.string().describe('Property address'),
    city: z.string().optional().describe('City'),
    propertyType: z.string().optional().describe('Property type'),
    bedrooms: z.number().optional().describe('Bedrooms'),
    bathrooms: z.number().optional().describe('Bathrooms'),
    areaSqft: z.number().optional().describe('Living area sqft'),
    yearBuilt: z.number().optional().describe('Year built'),
    condition: z.string().optional().describe('Condition: excellent, good, fair, poor'),
  },
  async (params) => {
    const data = loadData();
    if (!data.valuations) data.valuations = [];
    if (!data.nextValuationId) data.nextValuationId = 1;

    const searchLoc = (params.city || params.address.split(',')[0] || '').toLowerCase().trim();
    let comps = data.properties.filter(p => p.location?.toLowerCase().includes(searchLoc));
    if (params.propertyType) comps = comps.filter(p => p.type?.toLowerCase().includes(params.propertyType.toLowerCase()));
    if (params.bedrooms) comps = comps.filter(p => p.bedrooms && Math.abs(p.bedrooms - params.bedrooms) <= 1);

    const soldComps = comps.filter(p => p.status === 'sold' || p.status === 'rented');
    const allComps = soldComps.length >= 3 ? soldComps : comps;

    let estimated = { low: 0, mid: 0, high: 0 };
    let confidence = 'low';
    const comparableIds = [];

    if (allComps.length >= 3) {
      const prices = allComps.map(p => p.price).filter(Boolean).sort((a, b) => a - b);
      const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);

      // Adjust for sqft if available
      if (params.areaSqft) {
        const pricesPerSqft = allComps.filter(p => p.areaSqft).map(p => p.price / p.areaSqft);
        if (pricesPerSqft.length > 0) {
          const avgPpSqft = pricesPerSqft.reduce((s, p) => s + p, 0) / pricesPerSqft.length;
          const sqftBased = Math.round(avgPpSqft * params.areaSqft);
          estimated.mid = Math.round((avg + sqftBased) / 2);
        } else {
          estimated.mid = avg;
        }
      } else {
        estimated.mid = avg;
      }

      estimated.low = Math.round(estimated.mid * 0.9);
      estimated.high = Math.round(estimated.mid * 1.1);
      confidence = soldComps.length >= 5 ? 'high' : soldComps.length >= 3 ? 'medium' : 'low';
      comparableIds.push(...allComps.slice(0, 5).map(p => p.id));
    } else if (allComps.length > 0) {
      const prices = allComps.map(p => p.price).filter(Boolean);
      const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
      estimated = { low: Math.round(avg * 0.85), mid: avg, high: Math.round(avg * 1.15) };
      confidence = 'low';
      comparableIds.push(...allComps.map(p => p.id));
    }

    const valuation = {
      id: generateId('V', data.nextValuationId++),
      address: params.address, propertyType: params.propertyType,
      bedrooms: params.bedrooms, bathrooms: params.bathrooms, areaSqft: params.areaSqft,
      estimatedLow: estimated.low, estimatedMid: estimated.mid, estimatedHigh: estimated.high,
      confidence, comparableIds, convertedToLeadId: null, createdAt: new Date().toISOString(),
    };
    data.valuations.push(valuation);
    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      valuation,
      comparables: allComps.slice(0, 5).map(p => ({ id: p.id, title: p.title, price: p.price, areaSqft: p.areaSqft, location: p.location })),
      message: estimated.mid > 0
        ? `Estimated value for ${params.address}: ${estimated.low.toLocaleString()} - ${estimated.high.toLocaleString()} (${confidence} confidence, ${allComps.length} comps)`
        : `Insufficient data for ${params.address}. Add more properties in this area or connect ATTOM API for external data.`,
    }, null, 2) }] };
  }
);

server.tool(
  'valuation_to_lead',
  'Convert a home valuation inquiry into a seller lead.',
  {
    valuationId: z.string().describe('Valuation ID (e.g., V-0001)'),
    name: z.string().describe('Homeowner name'),
    phone: z.string().optional().describe('Phone number'),
    email: z.string().optional().describe('Email'),
    timeline: z.string().optional().describe('Selling timeline'),
  },
  async ({ valuationId, name, phone, email, timeline }) => {
    const data = loadData();
    const valuation = (data.valuations || []).find(v => v.id === valuationId);
    if (!valuation) return { content: [{ type: 'text', text: `Valuation ${valuationId} not found.` }] };
    if (valuation.convertedToLeadId) return { content: [{ type: 'text', text: `Already converted to lead ${valuation.convertedToLeadId}.` }] };

    const id = generateId('L', data.nextLeadId++);
    const lead = {
      id, name, phone, email, type: 'seller', source: 'valuation',
      propertyType: valuation.propertyType,
      preferredLocations: valuation.address ? [valuation.address.split(',')[0].trim()] : [],
      budgetMin: valuation.estimatedLow, budgetMax: valuation.estimatedHigh,
      timeline: timeline || '', preApproved: false,
      status: 'new', score: 0, category: 'cold',
      showingsCount: 0, followupsCount: 0,
      lastContactDate: today(), notes: `Seller lead from valuation ${valuationId}: ${valuation.address} (est. ${valuation.estimatedMid?.toLocaleString()})`,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);
    data.leads.push(lead);
    valuation.convertedToLeadId = id;

    // Auto-enroll in nurture
    autoEnrollLead(data, lead);
    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, lead,
      message: `Seller lead ${id} created from valuation — ${name} at ${valuation.address} (${lead.category.toUpperCase()}, score: ${lead.score})`,
    }, null, 2) }] };
  }
);

server.tool(
  'valuation_list',
  'List past home valuations.',
  {
    limit: z.number().default(20).describe('Max results'),
  },
  async ({ limit }) => {
    const data = loadData();
    const valuations = (data.valuations || []).slice(-limit).reverse();
    return { content: [{ type: 'text', text: JSON.stringify({
      total: valuations.length,
      valuations: valuations.map(v => ({
        id: v.id, address: v.address, estimated: `${v.estimatedLow?.toLocaleString()} - ${v.estimatedHigh?.toLocaleString()}`,
        confidence: v.confidence, convertedToLead: v.convertedToLeadId, date: v.createdAt?.split('T')[0],
      })),
    }, null, 2) }] };
  }
);

// ── Transaction Coordinator Tools (Phase 7) ───────────────────────────────

server.tool(
  'transaction_create',
  'Create a transaction from contract details. Parses deadlines and sets up milestone tracking.',
  {
    leadId: z.string().describe('Lead ID (buyer or seller)'),
    propertyId: z.string().describe('Property ID'),
    contractDate: z.string().describe('Contract execution date (YYYY-MM-DD)'),
    closeDate: z.string().describe('Expected closing date (YYYY-MM-DD)'),
    salePrice: z.number().describe('Agreed sale price'),
    inspectionDate: z.string().optional().describe('Inspection deadline (YYYY-MM-DD)'),
    appraisalDate: z.string().optional().describe('Appraisal deadline (YYYY-MM-DD)'),
    financingDate: z.string().optional().describe('Financing contingency deadline (YYYY-MM-DD)'),
    parties: z.array(z.object({
      role: z.string().describe('Role: buyer, seller, buyer_agent, seller_agent, lender, title_company'),
      name: z.string().describe('Name'),
      phone: z.string().optional(),
      email: z.string().optional(),
    })).optional().describe('Transaction parties'),
    notes: z.string().optional(),
  },
  async (params) => {
    const data = loadData();
    if (!data.transactions) data.transactions = [];
    if (!data.nextTransactionId) data.nextTransactionId = 1;

    const lead = data.leads.find(l => l.id === params.leadId);
    const property = data.properties.find(p => p.id === params.propertyId);
    if (!lead) return { content: [{ type: 'text', text: `Lead ${params.leadId} not found.` }] };
    if (!property) return { content: [{ type: 'text', text: `Property ${params.propertyId} not found.` }] };

    const deadlines = [];
    if (params.inspectionDate) deadlines.push({ name: 'Inspection', date: params.inspectionDate, status: 'pending', reminderSent: false });
    if (params.appraisalDate) deadlines.push({ name: 'Appraisal', date: params.appraisalDate, status: 'pending', reminderSent: false });
    if (params.financingDate) deadlines.push({ name: 'Financing Contingency', date: params.financingDate, status: 'pending', reminderSent: false });
    deadlines.push({ name: 'Closing', date: params.closeDate, status: 'pending', reminderSent: false });

    const documents = [
      { name: 'Purchase Agreement', status: 'received', dueDate: params.contractDate },
      { name: 'Inspection Report', status: 'pending', dueDate: params.inspectionDate || null },
      { name: 'Appraisal Report', status: 'pending', dueDate: params.appraisalDate || null },
      { name: 'Title Report', status: 'pending', dueDate: null },
      { name: 'Loan Approval', status: 'pending', dueDate: params.financingDate || null },
      { name: 'Closing Disclosure', status: 'pending', dueDate: params.closeDate },
    ];

    const id = generateId('T', data.nextTransactionId++);
    const transaction = {
      id, leadId: params.leadId, leadName: lead.name,
      propertyId: params.propertyId, propertyTitle: property.title,
      salePrice: params.salePrice, contractDate: params.contractDate, closeDate: params.closeDate,
      status: 'pending', deadlines, documents,
      parties: params.parties || [],
      notes: params.notes || '', createdAt: new Date().toISOString(),
    };
    data.transactions.push(transaction);

    // Update lead and property status
    lead.status = 'negotiation';
    lead.score = scoreLead(lead);
    lead.category = scoreCategory(lead.score);
    property.status = 'under-offer';

    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, transaction,
      message: `Transaction ${id} created — ${lead.name} buying ${property.title} for ${params.salePrice.toLocaleString()}. ${deadlines.length} deadlines tracked.`,
    }, null, 2) }] };
  }
);

server.tool(
  'transaction_status',
  'Get current status of a transaction including upcoming deadlines and pending documents.',
  {
    transactionId: z.string().describe('Transaction ID (e.g., T-0001)'),
  },
  async ({ transactionId }) => {
    const data = loadData();
    if (!data.transactions) data.transactions = [];
    const txn = data.transactions.find(t => t.id === transactionId);
    if (!txn) return { content: [{ type: 'text', text: `Transaction ${transactionId} not found.` }] };

    const todayStr = today();
    const upcomingDeadlines = txn.deadlines.filter(d => d.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
    const overdueDeadlines = upcomingDeadlines.filter(d => d.date < todayStr);
    const pendingDocs = txn.documents.filter(d => d.status === 'pending');

    return { content: [{ type: 'text', text: JSON.stringify({
      transaction: {
        id: txn.id, lead: txn.leadName, property: txn.propertyTitle,
        salePrice: txn.salePrice, status: txn.status,
        contractDate: txn.contractDate, closeDate: txn.closeDate,
        daysToClose: Math.max(0, Math.floor((new Date(txn.closeDate) - new Date()) / 86400000)),
      },
      deadlines: { upcoming: upcomingDeadlines, overdue: overdueDeadlines },
      documents: { pending: pendingDocs.length, total: txn.documents.length, pendingList: pendingDocs },
      parties: txn.parties,
    }, null, 2) }] };
  }
);

server.tool(
  'transaction_update',
  'Update a transaction — status, deadlines, documents, or notes.',
  {
    transactionId: z.string().describe('Transaction ID'),
    status: z.enum(['pending', 'inspection', 'appraisal', 'financing', 'clear-to-close', 'closed', 'cancelled']).optional().describe('New status'),
    deadlineName: z.string().optional().describe('Deadline name to update'),
    deadlineStatus: z.enum(['pending', 'completed', 'waived']).optional().describe('New deadline status'),
    documentName: z.string().optional().describe('Document name to update'),
    documentStatus: z.enum(['pending', 'received', 'signed', 'rejected']).optional().describe('New document status'),
    notes: z.string().optional().describe('Add notes'),
  },
  async (params) => {
    const data = loadData();
    if (!data.transactions) data.transactions = [];
    const txn = data.transactions.find(t => t.id === params.transactionId);
    if (!txn) return { content: [{ type: 'text', text: `Transaction ${params.transactionId} not found.` }] };

    if (params.status) {
      txn.status = params.status;
      if (params.status === 'closed') {
        // Mark property as sold, lead as closed-won
        const property = data.properties.find(p => p.id === txn.propertyId);
        const lead = data.leads.find(l => l.id === txn.leadId);
        if (property) property.status = 'sold';
        if (lead) {
          lead.status = 'closed-won';
          lead.score = scoreLead(lead);
          lead.category = scoreCategory(lead.score);
          // Auto-enroll in post-close nurture
          const postCloseSeq = (data.nurtureSequences || []).find(s => s.triggerCategory === 'post-close' && s.enabled);
          if (postCloseSeq) {
            const nextSend = new Date();
            nextSend.setDate(nextSend.getDate() + (postCloseSeq.steps[0]?.delayDays || 30));
            if (!data.nurtureEnrollments) data.nurtureEnrollments = [];
            data.nurtureEnrollments.push({
              leadId: lead.id, sequenceId: postCloseSeq.id, currentStep: 0,
              status: 'active', nextSendAt: nextSend.toISOString(),
              enrolledAt: new Date().toISOString(), completedAt: null,
            });
          }
        }
      }
    }

    if (params.deadlineName && params.deadlineStatus) {
      const dl = txn.deadlines.find(d => d.name.toLowerCase() === params.deadlineName.toLowerCase());
      if (dl) dl.status = params.deadlineStatus;
    }

    if (params.documentName && params.documentStatus) {
      const doc = txn.documents.find(d => d.name.toLowerCase() === params.documentName.toLowerCase());
      if (doc) doc.status = params.documentStatus;
    }

    if (params.notes) {
      const timestamp = today();
      txn.notes = txn.notes ? `${txn.notes}\n[${timestamp}] ${params.notes}` : `[${timestamp}] ${params.notes}`;
    }

    saveData(data);

    return { content: [{ type: 'text', text: JSON.stringify({
      success: true, transactionId: txn.id, status: txn.status,
      message: `Transaction ${txn.id} updated.${params.status === 'closed' ? ' Congratulations on closing! Property marked as sold, lead as closed-won.' : ''}`,
    }, null, 2) }] };
  }
);

server.tool(
  'transaction_list',
  'List all transactions with their status.',
  {
    status: z.string().optional().describe('Filter by status'),
    limit: z.number().default(20).describe('Max results'),
  },
  async ({ status, limit }) => {
    const data = loadData();
    let txns = data.transactions || [];
    if (status) txns = txns.filter(t => t.status === status);

    const todayStr = today();
    return { content: [{ type: 'text', text: JSON.stringify({
      total: txns.length,
      transactions: txns.slice(0, limit).map(t => ({
        id: t.id, lead: t.leadName, property: t.propertyTitle,
        salePrice: t.salePrice, status: t.status,
        closeDate: t.closeDate,
        daysToClose: t.status !== 'closed' && t.status !== 'cancelled'
          ? Math.max(0, Math.floor((new Date(t.closeDate) - new Date()) / 86400000)) : null,
        overdueDeadlines: t.deadlines.filter(d => d.status === 'pending' && d.date < todayStr).length,
        pendingDocs: t.documents.filter(d => d.status === 'pending').length,
      })),
    }, null, 2) }] };
  }
);

server.tool(
  'deadline_reminder',
  'Get upcoming and overdue deadlines across all active transactions.',
  {
    daysAhead: z.number().default(7).describe('Look ahead N days'),
  },
  async ({ daysAhead }) => {
    const data = loadData();
    const todayStr = today();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const futureStr = futureDate.toISOString().split('T')[0];

    const activeTxns = (data.transactions || []).filter(t => t.status !== 'closed' && t.status !== 'cancelled');
    const allDeadlines = [];

    for (const txn of activeTxns) {
      for (const dl of txn.deadlines) {
        if (dl.status !== 'pending') continue;
        allDeadlines.push({
          transactionId: txn.id, lead: txn.leadName, property: txn.propertyTitle,
          deadline: dl.name, date: dl.date,
          isOverdue: dl.date < todayStr, daysUntil: Math.floor((new Date(dl.date) - new Date()) / 86400000),
        });
      }
    }

    const overdue = allDeadlines.filter(d => d.isOverdue);
    const upcoming = allDeadlines.filter(d => !d.isOverdue && d.date <= futureStr);

    return { content: [{ type: 'text', text: JSON.stringify({
      overdue: { count: overdue.length, deadlines: overdue },
      upcoming: { count: upcoming.length, deadlines: upcoming.sort((a, b) => a.date.localeCompare(b.date)) },
      message: overdue.length > 0
        ? `⚠️ ${overdue.length} OVERDUE deadline(s)! Take action immediately.`
        : upcoming.length > 0
          ? `${upcoming.length} deadline(s) coming up in the next ${daysAhead} days.`
          : 'No upcoming deadlines.',
    }, null, 2) }] };
  }
);

server.tool(
  'document_checklist',
  'Track document status for a transaction.',
  {
    transactionId: z.string().describe('Transaction ID'),
    action: z.enum(['view', 'add', 'update']).default('view').describe('view = show checklist, add = add document, update = update status'),
    documentName: z.string().optional().describe('Document name (for add/update)'),
    documentStatus: z.enum(['pending', 'received', 'signed', 'rejected']).optional().describe('Status (for add/update)'),
    dueDate: z.string().optional().describe('Due date YYYY-MM-DD (for add)'),
  },
  async (params) => {
    const data = loadData();
    const txn = (data.transactions || []).find(t => t.id === params.transactionId);
    if (!txn) return { content: [{ type: 'text', text: `Transaction ${params.transactionId} not found.` }] };

    if (params.action === 'add' && params.documentName) {
      txn.documents.push({ name: params.documentName, status: params.documentStatus || 'pending', dueDate: params.dueDate || null });
      saveData(data);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Document "${params.documentName}" added to ${txn.id}.` }, null, 2) }] };
    }

    if (params.action === 'update' && params.documentName && params.documentStatus) {
      const doc = txn.documents.find(d => d.name.toLowerCase() === params.documentName.toLowerCase());
      if (!doc) return { content: [{ type: 'text', text: `Document "${params.documentName}" not found in ${txn.id}.` }] };
      doc.status = params.documentStatus;
      saveData(data);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `"${params.documentName}" → ${params.documentStatus}` }, null, 2) }] };
    }

    // View
    const received = txn.documents.filter(d => d.status === 'received' || d.status === 'signed').length;
    return { content: [{ type: 'text', text: JSON.stringify({
      transactionId: txn.id, lead: txn.leadName, property: txn.propertyTitle,
      progress: `${received}/${txn.documents.length} documents completed`,
      documents: txn.documents,
    }, null, 2) }] };
  }
);

// ── Start server ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Real Estate MCP server running on stdio\n');
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});

// Export for testing
if (typeof module !== 'undefined') {
  module.exports = {
    loadData, saveData, defaultData,
    generateId, scoreLead, scoreCategory, matchScore, today,
    analyzeBantGaps, ensureNurtureDefaults, autoEnrollLead,
    DATA_PATH,
  };
}
