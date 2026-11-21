-- Migration: allow performance-commentary events in the Live Updates feed.
-- Adds: performance_up, performance_down, fatigue_warning, pacing.
-- Safe to re-run.

ALTER TABLE public.campaign_events
    DROP CONSTRAINT IF EXISTS campaign_events_event_type_check;

ALTER TABLE public.campaign_events
    ADD CONSTRAINT campaign_events_event_type_check CHECK (event_type IN (
        'status_changed',
        'campaign_completed',
        'new_results',
        'spend_milestone',
        'budget_milestone',
        'performance_up',
        'performance_down',
        'fatigue_warning',
        'pacing'
    ));
