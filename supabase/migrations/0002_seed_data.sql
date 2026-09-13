-- Migration 0002_seed_data.sql
-- DEVELOPMENT ONLY: Inserts seed data for Marketivity Client Portal

-- Ensure we're in a safe environment (optional safeguard)
-- DO NOT RUN IN PRODUCTION

DO $$
DECLARE
  v_org_id UUID := '11111111-1111-1111-1111-111111111111';
  v_client_id UUID := '22222222-2222-2222-2222-222222222222';
  v_ad_account_id UUID := '33333333-3333-3333-3333-333333333333';
  v_campaign_id UUID := '44444444-4444-4444-4444-444444444444';
  
  -- NOTE: You must create this user in Supabase Auth via the dashboard
  -- Email: marketivitybd@gmail.com
  -- Password: [hidden]
  -- Then replace this UUID with the actual auth.users ID
  v_demo_auth_user_id UUID := '804c50e9-bf81-4d43-87a6-e7160541f4db';
BEGIN

  -- 1. Create Marketivity Organization
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_id, 'Marketivity', 'marketivity')
  ON CONFLICT (slug) DO NOTHING;

  -- 2. Create Demo Client
  INSERT INTO public.clients (id, organization_id, name, email, company_name)
  VALUES (v_client_id, v_org_id, 'Demo Client', 'marketivitybd@gmail.com', 'Rahman Retail')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Create Demo Ad Account
  INSERT INTO public.ad_accounts (id, organization_id, name, meta_ad_account_id)
  VALUES (v_ad_account_id, v_org_id, 'Rahman Retail Meta Ads', 'act_123456789')
  ON CONFLICT (meta_ad_account_id) DO NOTHING;

  -- 4. Create Demo Campaign
  INSERT INTO public.campaigns (id, ad_account_id, meta_campaign_id, name, objective, status, daily_budget)
  VALUES (v_campaign_id, v_ad_account_id, 'camp_987654321', 'Rahman Retail — Messages', 'Messaging Conversations', 'ACTIVE', 5.00)
  ON CONFLICT (meta_campaign_id) DO NOTHING;

  -- 5. Assign Campaign to Client
  INSERT INTO public.campaign_assignments (campaign_id, client_id)
  VALUES (v_campaign_id, v_client_id)
  ON CONFLICT (campaign_id, client_id) DO NOTHING;

  -- 6. Note on Profiles
  -- Because auth_user_id has a foreign key to auth.users, we cannot insert the profile
  -- here unless the auth user already exists.
  -- After creating the user in Supabase Auth, run:
  -- INSERT INTO public.profiles (auth_user_id, organization_id, client_id, role, full_name, email)
  -- VALUES ('804c50e9-bf81-4d43-87a6-e7160541f4db', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'client', 'Demo User', 'marketivitybd@gmail.com');

END $$;
