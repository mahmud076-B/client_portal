-- Add messaging metrics to campaign_insights table
ALTER TABLE public.campaign_insights
ADD COLUMN messaging_conversations_started INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN cost_per_messaging_conversation NUMERIC(12,4) NULL;
