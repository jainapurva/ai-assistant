/**
 * Nurture Runner — processes due nurture sends for all active real-estate agent workspaces.
 *
 * Registered as a cron job (every 15 min) in index.js.
 * Reads realestate-data.json from each user's agent workspace, finds due enrollments,
 * generates messages, and sends them via WhatsApp to the agent's chat.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config');

// Reference to the send function (set via init)
let sendMessageFn = null;

function init(sendFn) {
  sendMessageFn = sendFn;
}

/**
 * Process nurture sends for a specific user's real estate data.
 * Returns array of messages to send.
 */
function processNurtureForUser(dataPath) {
  try {
    if (!fs.existsSync(dataPath)) return [];
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!data.nurtureEnrollments || !data.nurtureSequences) return [];

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const due = data.nurtureEnrollments.filter(
      e => e.status === 'active' && new Date(e.nextSendAt) <= now
    );

    if (due.length === 0) return [];

    const messages = [];

    for (const enrollment of due) {
      const lead = data.leads?.find(l => l.id === enrollment.leadId);
      const seq = data.nurtureSequences.find(s => s.id === enrollment.sequenceId);
      if (!lead || !seq) continue;

      const step = seq.steps[enrollment.currentStep];
      if (!step) {
        enrollment.status = 'completed';
        enrollment.completedAt = now.toISOString();
        continue;
      }

      let content = '';
      switch (step.messageType) {
        case 'property_match': {
          const available = (data.properties || []).filter(p => p.status === 'available');
          const topMatches = available
            .filter(p => {
              if (!lead.preferredLocations?.length) return true;
              return lead.preferredLocations.some(loc =>
                p.location?.toLowerCase().includes(loc.toLowerCase())
              );
            })
            .slice(0, 3);

          if (topMatches.length > 0) {
            content = `*[Nurture]* Property matches for *${lead.name}* (${lead.category}):\n\n` +
              topMatches.map((p, i) =>
                `${i + 1}. *${p.title}* — ${p.location}\n   💰 ${p.price?.toLocaleString()} | ${p.bedrooms || '?'} bed | ${p.areaSqft || '?'} sqft`
              ).join('\n\n') +
              '\n\n_Suggested action: Forward these to the lead or schedule a showing._';
          } else {
            content = `*[Nurture]* ${lead.name} (${lead.category}) is due for a property update, but no matches found. Consider adding new listings.`;
          }
          break;
        }
        case 'market_update': {
          const location = lead.preferredLocations?.[0] || 'the area';
          content = `*[Nurture]* Market update due for *${lead.name}* (${lead.category}):\n\n` +
            `📍 ${location}\n` +
            `_Send them recent market stats for their area._`;
          break;
        }
        case 'check_in':
          content = `*[Nurture]* Check-in due for *${lead.name}* (${lead.category}):\n\n` +
            `_Reach out and ask how their search is going. Offer to help with updated matches._`;
          break;
        case 'custom':
          content = `*[Nurture]* Follow-up for *${lead.name}* (${lead.category}):\n\n` +
            (step.customMessage || '_Custom follow-up due._');
          break;
      }

      messages.push({ leadId: lead.id, leadName: lead.name, content });

      // Advance enrollment
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

      // Update lead last contact
      if (lead) lead.lastContactDate = todayStr;
    }

    if (messages.length > 0) {
      // Save updated enrollments
      const tmp = dataPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, dataPath);
    }

    return messages;
  } catch (err) {
    logger.error('[nurture-runner] Error processing', dataPath, err.message);
    return [];
  }
}

/**
 * Scan all sandbox agent workspaces for real estate data and process nurture.
 */
async function runNurtureCycle(chatIdToDataPath) {
  if (!sendMessageFn) {
    logger.warn('[nurture-runner] No send function configured, skipping');
    return;
  }

  let totalProcessed = 0;

  for (const [chatId, dataPath] of Object.entries(chatIdToDataPath)) {
    const messages = processNurtureForUser(dataPath);
    for (const msg of messages) {
      try {
        await sendMessageFn(chatId, msg.content);
        totalProcessed++;
      } catch (err) {
        logger.error('[nurture-runner] Failed to send to', chatId, err.message);
      }
    }
  }

  if (totalProcessed > 0) {
    logger.info(`[nurture-runner] Processed ${totalProcessed} nurture messages`);
  }
}

/**
 * Find all active real-estate agent data files across sandboxes.
 */
function discoverDataPaths() {
  const sandboxBase = config.sandboxBaseDir;
  const paths = {};

  try {
    if (!fs.existsSync(sandboxBase)) return paths;
    const dirs = fs.readdirSync(sandboxBase);
    for (const dir of dirs) {
      const dataPath = path.join(sandboxBase, dir, 'workspace', 'agents', 'real-estate', 'realestate-data.json');
      if (fs.existsSync(dataPath)) {
        // The dir name is the hashed chatId — we need to reverse-map it
        // For now, store with the hash and look up chatId from state
        paths[dir] = dataPath;
      }
    }
  } catch (err) {
    logger.error('[nurture-runner] Discovery error:', err.message);
  }

  return paths;
}

module.exports = { init, runNurtureCycle, processNurtureForUser, discoverDataPaths };
