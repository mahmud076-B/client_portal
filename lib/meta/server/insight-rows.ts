import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedCampaignInsight } from './insights';

function isMissingColumnError(err: { code?: string; message?: string }): boolean {
    return err.code === 'PGRST204' || err.code === '42703' || /column .* does not exist|Could not find the .* column/i.test(err.message || '');
}

/** One campaign_insights row from one Meta daily insight. */
export function toInsightRow(insight: NormalizedCampaignInsight, campaignId: string) {
    return {
        campaign_id: campaignId,
        date: insight.date,
        impressions: insight.impressions,
        clicks: insight.clicks,
        inline_link_clicks: insight.inline_link_clicks,
        spend: insight.spend,
        reach: insight.reach,
        cpc: insight.cpc,
        cpm: insight.cpm,
        ctr: insight.ctr,
        messaging_conversations_started: insight.messaging_conversations_started,
        cost_per_messaging_conversation: insight.cost_per_messaging_conversation,
        actions: insight.actions,
        action_values: insight.action_values,
        cost_per_action_type: insight.cost_per_action_type,
        video_thruplays: insight.video_thruplays,
        frequency: insight.frequency,
        updated_at: new Date().toISOString(),
    };
}

/**
 * Upserts daily rows. Degrades gracefully while migrations are pending:
 * without inline_link_clicks (20261127000000) link clicks still come from the
 * `link_click` action; without the result columns (20261122000000) only legacy columns are stored.
 */
export async function upsertInsightRows(supabase: SupabaseClient, rows: ReturnType<typeof toInsightRow>[]) {
    if (rows.length === 0) return;
    const upsert = (payload: Record<string, unknown>[]) =>
        supabase.from('campaign_insights').upsert(payload, { onConflict: 'campaign_id,date', ignoreDuplicates: false });

    let { error } = await upsert(rows);
    if (error && isMissingColumnError(error)) {
        console.warn('[Sync] campaign_insights.inline_link_clicks missing; apply migration 20261127000000_link_clicks.sql');
        const noLink = rows.map(({ inline_link_clicks: _l, ...rest }) => rest);
        ({ error } = await upsert(noLink));
        if (error && isMissingColumnError(error)) {
            console.warn('[Sync] campaign_insights result columns missing; apply migration 20261122000000_campaign_results.sql');
            ({ error } = await upsert(
                noLink.map(({ actions: _a, action_values: _v, cost_per_action_type: _c, video_thruplays: _t, frequency: _f, ...rest }) => rest)
            ));
        }
    }
    if (error) throw new Error(`Upsert error: ${error.message}`);
}
