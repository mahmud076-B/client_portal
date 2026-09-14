const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');

const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const metaKey = env.match(/META_ENCRYPTION_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);
const META_API_VERSION = 'v26.0';

function decryptToken(encryptedToken, iv, authTag) {
  const key = Buffer.from(metaKey, 'hex');
  const ivBuf = Buffer.from(iv, 'hex');
  const tagBuf = Buffer.from(authTag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);
  return decipher.update(encryptedToken, 'hex', 'utf8') + decipher.final('utf8');
}

function parseMessagingMetrics(row) {
    let messaging_conversations_started = 0;
    let cost_per_messaging_conversation = null;
    
    const actionType = 'onsite_conversion.messaging_conversation_started_7d';
    
    if (Array.isArray(row.actions)) {
        const msgAction = row.actions.find(a => a.action_type === actionType);
        if (msgAction && msgAction.value) {
            const parsed = parseInt(msgAction.value, 10);
            if (!isNaN(parsed)) messaging_conversations_started = parsed;
        }
    }
    
    if (Array.isArray(row.cost_per_action_type)) {
        const msgCost = row.cost_per_action_type.find(c => c.action_type === actionType);
        if (msgCost && msgCost.value) {
            const parsed = parseFloat(msgCost.value);
            if (!isNaN(parsed)) cost_per_messaging_conversation = parsed;
        }
    }
    
    return {
        messaging_conversations_started,
        cost_per_messaging_conversation
    };
}

async function fetchWithPagination(url) {
    let results = [];
    let nextUrl = url;
    let count = 0;
    while (nextUrl && count < 50) {
        count++;
        const res = await fetch(nextUrl);
        const data = await res.json();
        if (data.data) {
            results = results.concat(data.data);
        }
        if (data.paging && data.paging.next) {
            nextUrl = data.paging.next;
        } else {
            nextUrl = null;
        }
    }
    return results;
}

async function run() {
  console.log('--- Starting Backfill ---');
  const { data: connections } = await supabase.from('meta_connections').select('*').eq('status', 'connected');
  
  let totalFound = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalNoMsg = 0;
  
  for (const conn of connections) {
      console.log(`Processing Org: ${conn.organization_id}`);
      const token = decryptToken(conn.encrypted_token, conn.iv, conn.auth_tag);
      
      const { data: adAccounts } = await supabase.from('ad_accounts').select('*').eq('organization_id', conn.organization_id).eq('status', 'active');
      
      for (const adAccount of adAccounts) {
          console.log(`  Ad Account: ${adAccount.meta_ad_account_id}`);
          
          const { data: dbCampaigns } = await supabase.from('campaigns').select('id, meta_campaign_id').eq('ad_account_id', adAccount.id);
          if (!dbCampaigns || dbCampaigns.length === 0) continue;
          
          const campaignMap = new Map(dbCampaigns.map(c => [c.meta_campaign_id, c.id]));
          
          // Get the distinct dates we already have for this account
          const { data: insights } = await supabase.from('campaign_insights').select('id, campaign_id, date, messaging_conversations_started');
          if (!insights) continue;
          
          // filter insights by campaigns in this ad account
          const accountInsights = insights.filter(i => Array.from(campaignMap.values()).includes(i.campaign_id));
          
          if (accountInsights.length === 0) {
              console.log('    No existing insights to backfill.');
              continue;
          }
          
          // Get the min and max dates
          let minDate = accountInsights[0].date;
          let maxDate = accountInsights[0].date;
          for (const i of accountInsights) {
              if (i.date < minDate) minDate = i.date;
              if (i.date > maxDate) maxDate = i.date;
          }
          
          console.log(`    Date range: ${minDate} to ${maxDate}`);
          
          // Fetch daily data from Meta
          const actId = adAccount.meta_ad_account_id.startsWith('act_') ? adAccount.meta_ad_account_id : 'act_' + adAccount.meta_ad_account_id;
          const url = 'https://graph.facebook.com/' + META_API_VERSION + '/' + actId + '/insights?level=campaign&time_range={"since":"' + minDate + '","until":"' + maxDate + '"}&time_increment=1&fields=campaign_id,date_start,actions,cost_per_action_type&access_token=' + token;
          
          const metaData = await fetchWithPagination(url);
          console.log(`    Fetched ${metaData.length} daily rows from Meta`);
          
          // Match and update
          for (const mRow of metaData) {
              const internalId = campaignMap.get(mRow.campaign_id);
              if (!internalId) continue;
              
              const matchingDbInsight = accountInsights.find(i => i.campaign_id === internalId && i.date === mRow.date_start);
              if (matchingDbInsight) {
                  totalFound++;
                  const metrics = parseMessagingMetrics(mRow);
                  
                  // if undefined or already zero in DB
                  if (metrics.messaging_conversations_started === 0 && matchingDbInsight.messaging_conversations_started === 0) {
                      totalNoMsg++;
                      totalSkipped++;
                      continue;
                  }
                  
                  const { error } = await supabase.from('campaign_insights').update({
                      messaging_conversations_started: metrics.messaging_conversations_started,
                      cost_per_messaging_conversation: metrics.cost_per_messaging_conversation
                  }).eq('id', matchingDbInsight.id);
                  
                  if (error) {
                      console.error(`    Error updating insight ${matchingDbInsight.id}:`, error);
                  } else {
                      totalUpdated++;
                      if (metrics.messaging_conversations_started > 0) {
                          console.log(`    Updated ${internalId} on ${mRow.date_start} | Msgs: ${metrics.messaging_conversations_started} | Cost: ${metrics.cost_per_messaging_conversation}`);
                      }
                  }
              }
          }
      }
  }
  
  console.log('\n--- Backfill Summary ---');
  console.log(`Rows Found: ${totalFound}`);
  console.log(`Rows Updated: ${totalUpdated}`);
  console.log(`Rows Skipped (No change): ${totalSkipped}`);
  console.log(`Rows with no messages: ${totalNoMsg}`);
}

run().catch(console.error);
