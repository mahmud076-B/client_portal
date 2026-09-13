'use server';

import { requireAdmin } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { MetaServerClient } from '@/lib/meta/server/client';
import { revalidatePath } from 'next/cache';

/**
 * Discovers Ad Accounts using the connected Meta API.
 */
export async function discoverAdAccounts() {
    const { profile } = await requireAdmin();
    const supabase = await createClient();

    // Fetch the connection
    const { data: connection, error: connectionError } = await supabase
        .from('meta_connections')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .single();

    if (connectionError || !connection) {
        throw new Error('No Meta connection found. Please connect Meta first.');
    }

    try {
        // Initialize securely
        const metaClient = new MetaServerClient({
            iv: connection.iv,
            encryptedToken: connection.encrypted_token,
            authTag: connection.auth_tag
        });

        // Call our safe normalized client method
        const accounts = await metaClient.getAdAccounts();
        
        return { success: true, accounts };
    } catch (error: any) {
        // Return a normalized, safe error message to the browser
        return { success: false, error: 'Failed to discover Ad Accounts. Your token may have expired.' };
    }
}

/**
 * Registers an Ad Account safely into the database after validating it against Meta again.
 */
export async function registerAdAccount(metaAdAccountId: string) {
    const { profile } = await requireAdmin();
    const supabase = await createClient();

    if (!metaAdAccountId) {
        return { success: false, error: 'Meta Ad Account ID is required.' };
    }

    // 1. Fetch the Meta connection
    const { data: connection, error: connectionError } = await supabase
        .from('meta_connections')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .single();

    if (connectionError || !connection) {
        return { success: false, error: 'Meta is not connected.' };
    }

    try {
        // 2. Anti-tampering Check
        // We do NOT trust the browser's ID. We fetch from Meta again and prove it exists.
        const metaClient = new MetaServerClient({
            iv: connection.iv,
            encryptedToken: connection.encrypted_token,
            authTag: connection.auth_tag
        });

        const availableAccounts = await metaClient.getAdAccounts();
        
        const targetAccount = availableAccounts.find((acc: any) => acc.id === metaAdAccountId);

        if (!targetAccount) {
            return { success: false, error: 'The requested Ad Account does not belong to your Meta connection.' };
        }

        // 3. Insert/Upsert into Supabase `ad_accounts` table
        // Because of the UNIQUE constraint on meta_ad_account_id, if this is already
        // claimed by another organization, this will throw an error, protecting cross-org boundaries.
        // It's also restricted by RLS (Admin can only insert for their own org).

        const { error: insertError } = await supabase
            .from('ad_accounts')
            .upsert({
                organization_id: profile.organization_id,
                meta_ad_account_id: targetAccount.id, // e.g., 'act_123'
                name: targetAccount.name,
                status: 'active', // default Marketivity internal status
                currency: targetAccount.currency,
                timezone_name: targetAccount.timezone_name
            }, {
                onConflict: 'meta_ad_account_id', 
                ignoreDuplicates: false // Will update name/currency if already exists for THIS organization
            });

        if (insertError) {
            if (insertError.code === '23505') {
                return { success: false, error: 'This Ad Account is already registered.' };
            }
            // Generic safe error
            return { success: false, error: 'Failed to register the Ad Account due to a database error.' };
        }

        revalidatePath('/admin/meta');
        return { success: true };

    } catch (error: any) {
        return { success: false, error: 'An unexpected error occurred while registering the Ad Account.' };
    }
}

/**
 * Discovers Campaigns for a specifically registered Ad Account.
 */
export async function discoverCampaigns(localAdAccountId: string) {
    const { profile } = await requireAdmin();
    const supabase = await createClient();

    // 1. Validate the local Ad Account belongs to this organization
    const { data: adAccount, error: adAccountError } = await supabase
        .from('ad_accounts')
        .select('*')
        .eq('id', localAdAccountId)
        .eq('organization_id', profile.organization_id)
        .single();

    if (adAccountError || !adAccount) {
        return { success: false, error: 'This Ad Account is not available to your organization.' };
    }

    // 2. Fetch the Meta connection
    const { data: connection, error: connectionError } = await supabase
        .from('meta_connections')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .single();

    if (connectionError || !connection) {
        return { success: false, error: 'Meta is not connected.' };
    }

    try {
        const metaClient = new MetaServerClient({
            iv: connection.iv,
            encryptedToken: connection.encrypted_token,
            authTag: connection.auth_tag
        });

        const campaigns = await metaClient.getCampaigns(adAccount.meta_ad_account_id);
        
        return { success: true, campaigns };
    } catch (error: any) {
        return { success: false, error: 'Failed to discover campaigns. Meta API request failed.' };
    }
}

/**
 * Registers a campaign securely by validating it against Meta before inserting.
 */
export async function registerCampaign(metaCampaignId: string, localAdAccountId: string) {
    const { profile } = await requireAdmin();
    const supabase = await createClient();

    // 1. Verify local Ad Account ownership
    const { data: adAccount, error: adAccountError } = await supabase
        .from('ad_accounts')
        .select('*')
        .eq('id', localAdAccountId)
        .eq('organization_id', profile.organization_id)
        .single();

    if (adAccountError || !adAccount) {
        return { success: false, error: 'This Ad Account is not available to your organization.' };
    }

    // 2. Fetch the Meta connection
    const { data: connection, error: connectionError } = await supabase
        .from('meta_connections')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .single();

    if (connectionError || !connection) {
        return { success: false, error: 'Meta is not connected.' };
    }

    try {
        // 3. Anti-Tampering: Fetch campaigns from Meta and prove this ID exists
        const metaClient = new MetaServerClient({
            iv: connection.iv,
            encryptedToken: connection.encrypted_token,
            authTag: connection.auth_tag
        });

        const availableCampaigns = await metaClient.getCampaigns(adAccount.meta_ad_account_id);
        const targetCampaign = availableCampaigns.find((c: any) => c.id === metaCampaignId);

        if (!targetCampaign) {
            return { success: false, error: 'This campaign could not be verified with Meta or does not belong to the selected Ad Account.' };
        }

        // 4. Insert into local `campaigns` table
        // Note: RLS now explicitly allows INSERT for admins where ad_account belongs to their org.
        const { error: insertError } = await supabase
            .from('campaigns')
            .upsert({
                ad_account_id: localAdAccountId, // References our validated local Ad Account
                meta_campaign_id: targetCampaign.id,
                name: targetCampaign.name,
                status: targetCampaign.status || 'UNKNOWN',
                effective_status: targetCampaign.effective_status || null,
                objective: targetCampaign.objective || null,
                buying_type: targetCampaign.buying_type || null
            }, {
                onConflict: 'meta_campaign_id',
                ignoreDuplicates: false
            });

        if (insertError) {
            if (insertError.code === '23505') {
                return { success: false, error: 'This campaign is already registered.' };
            }
            return { success: false, error: 'Failed to register campaign due to a database error.' };
        }

        revalidatePath('/admin/meta');
        return { success: true };

    } catch (error: any) {
        return { success: false, error: 'An unexpected error occurred while registering the campaign.' };
    }
}

/**
 * Assigns a registered campaign to a specific client.
 */
export async function assignCampaign(localCampaignId: string, localClientId: string) {
    const { profile } = await requireAdmin();
    const supabase = await createClient();

    // 1. Verify Client belongs to this organization
    const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', localClientId)
        .eq('organization_id', profile.organization_id)
        .single();

    if (clientError || !client) {
        return { success: false, error: 'The selected client is not available to your organization.' };
    }

    // 2. Verify Campaign belongs to this organization (via Ad Account join in RLS or explicit check)
    // We do an explicit check to be absolutely safe
    const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, ad_accounts!inner(organization_id)')
        .eq('id', localCampaignId)
        .eq('ad_accounts.organization_id', profile.organization_id)
        .single();

    if (campaignError || !campaign) {
        return { success: false, error: 'The selected campaign is not available to your organization.' };
    }

    // 3. Insert assignment
    const { error: insertError } = await supabase
        .from('campaign_assignments')
        .insert({
            campaign_id: localCampaignId,
            client_id: localClientId
        });

    if (insertError) {
        console.error('campaign_assignments INSERT error:', insertError);
        if (insertError.code === '23505') {
            return { success: false, error: 'This campaign is already assigned to this client.' };
        }
        return { success: false, error: 'Failed to assign campaign due to a database error.' };
    }

    revalidatePath('/admin/meta');
    return { success: true };
}
