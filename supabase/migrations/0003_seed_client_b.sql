-- Migration 0003_seed_test_data.sql
-- Auto-generated for Step 03 test isolation

DO $$
DECLARE
  v_org_marketivity_id UUID;
  v_org_b_id UUID;
  v_client_a_id UUID;
  v_client_b_id UUID;
  v_client_c_id UUID;
  v_ad_account_1_id UUID;
  v_ad_account_2_id UUID;
  v_campaign_a_id UUID;
  v_campaign_b_id UUID;
  v_campaign_c_id UUID;
BEGIN

  -- Get Marketivity Org
  SELECT id INTO v_org_marketivity_id FROM public.organizations WHERE slug = 'marketivity' LIMIT 1;

  -- Create Org B
  INSERT INTO public.organizations (name, slug)
  VALUES ('Competitor Agency', 'competitor-agency')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_org_b_id;

  -- Get Client A
  SELECT id INTO v_client_a_id FROM public.clients WHERE name = 'Demo Client' LIMIT 1;

  -- Create Client B (Under Marketivity)
  INSERT INTO public.clients (organization_id, name, email, company_name)
  VALUES (v_org_marketivity_id, 'Client B', 'clientb@demo.com', 'Company B')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_client_b_id;
  IF v_client_b_id IS NULL THEN
    SELECT id INTO v_client_b_id FROM public.clients WHERE email = 'clientb@demo.com' LIMIT 1;
  END IF;

  -- Create Client C (Under Org B)
  INSERT INTO public.clients (organization_id, name, email, company_name)
  VALUES (v_org_b_id, 'Client C', 'clientc@demo.com', 'Company C')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_client_c_id;
  IF v_client_c_id IS NULL THEN
    SELECT id INTO v_client_c_id FROM public.clients WHERE email = 'clientc@demo.com' LIMIT 1;
  END IF;

  -- Profile for Client B
  INSERT INTO public.profiles (auth_user_id, organization_id, client_id, role, full_name, email)
  VALUES ('4931d7a8-4cd9-4ca8-8933-283aaa07e09c', v_org_marketivity_id, v_client_b_id, 'client', 'Demo User B', 'clientb@demo.com')
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Profile for Client C
  INSERT INTO public.profiles (auth_user_id, organization_id, client_id, role, full_name, email)
  VALUES ('42e0cd30-492d-466d-b928-9be3e8c33c90', v_org_b_id, v_client_c_id, 'client', 'Demo User C', 'clientc@demo.com')
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Profile for Admin B
  INSERT INTO public.profiles (auth_user_id, organization_id, role, full_name, email)
  VALUES ('c44bf28b-0f5d-4507-ac53-8379211986c1', v_org_b_id, 'admin', 'Admin User B', 'adminb@demo.com')
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Get Ad Account 1
  SELECT id INTO v_ad_account_1_id FROM public.ad_accounts WHERE meta_ad_account_id = 'act_123456789' LIMIT 1;

  -- Create Ad Account 2 (for Org B)
  INSERT INTO public.ad_accounts (organization_id, name, meta_ad_account_id)
  VALUES (v_org_b_id, 'Org B Ad Account', 'act_999999999')
  ON CONFLICT (meta_ad_account_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_ad_account_2_id;

  -- Get Campaign A
  SELECT id INTO v_campaign_a_id FROM public.campaigns WHERE meta_campaign_id = 'cmp_1111' LIMIT 1;

  -- Create Campaign B
  INSERT INTO public.campaigns (ad_account_id, meta_campaign_id, name, objective, status)
  VALUES (v_ad_account_1_id, 'cmp_2222', 'Campaign B - Leads', 'LEAD_GENERATION', 'ACTIVE')
  ON CONFLICT (meta_campaign_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_campaign_b_id;

  -- Create Campaign C
  INSERT INTO public.campaigns (ad_account_id, meta_campaign_id, name, objective, status)
  VALUES (v_ad_account_2_id, 'cmp_3333', 'Campaign C - Sales', 'OUTCOME_SALES', 'ACTIVE')
  ON CONFLICT (meta_campaign_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_campaign_c_id;

  -- Assign Campaign B to Client B
  INSERT INTO public.campaign_assignments (campaign_id, client_id)
  VALUES (v_campaign_b_id, v_client_b_id)
  ON CONFLICT (campaign_id, client_id) DO NOTHING;

  -- Assign Campaign C to Client C
  INSERT INTO public.campaign_assignments (campaign_id, client_id)
  VALUES (v_campaign_c_id, v_client_c_id)
  ON CONFLICT (campaign_id, client_id) DO NOTHING;

END $$;
