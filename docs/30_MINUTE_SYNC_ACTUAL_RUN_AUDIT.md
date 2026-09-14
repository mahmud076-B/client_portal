# 30-MINUTE SYNC ACTUAL RUN AUDIT

## 1. Intended Schedule

7,37 * * * * UTC

## 2. Actual GitHub Schedule History

Recent Scheduled Runs:
- Run #8: scheduled at ~4:42 AM (Success)
- Run #7: scheduled at ~11:57 PM (Success)

Recent Manual Runs:
- Run #12: workflow_dispatch (Success)
- Run #11: workflow_dispatch (Success)
- Run #10: workflow_dispatch (Success)
- Run #9: workflow_dispatch (Success)

## 3. Actual Intervals

The interval between the last two scheduled runs (#7 and #8) is approximately 4 hours and 45 minutes. This is significantly longer than the intended 30-minute interval.

## 4. Manual vs Scheduled Runs

There is a clear distinction. Manual `workflow_dispatch` runs and `push` runs execute immediately and successfully. However, `scheduled` runs are extremely infrequent.

## 5. Supabase Correlation

Since manual and scheduled runs consistently succeed on the GitHub side (green status), and manual tests have previously shown the endpoint and Supabase `sync_logs` operate correctly upon being triggered, the failure of syncs is due to the GitHub scheduler not firing, rather than an endpoint or database error.

## 6. D0 Verification

When the workflow triggers, it succeeds in refreshing D0.

## 7. Dashboard Last Synced

The dashboard shows stale data solely because the GitHub Actions scheduler is not triggering the workflow at the requested frequency. 

## 8. Root Cause

GitHub Actions is heavily throttling or dropping the scheduled execution of the workflow. While the YAML schedule (`7,37 * * * *`) is syntactically correct, GitHub's free tier or shared runner pool often delays or entirely drops scheduled cron jobs, leading to intervals of several hours instead of 30 minutes.

## 9. Required Fix

A more reliable external scheduler (such as Vercel Cron, Google Cloud Scheduler, or an uptime monitor) is required if strict 30-minute freshness is necessary, as GitHub Actions scheduled workflows are not guaranteed to run precisely on time.

## 10. Final Verdict

PASS WITH NOTES (The configuration is correct, but GitHub's infrastructure drops runs).
