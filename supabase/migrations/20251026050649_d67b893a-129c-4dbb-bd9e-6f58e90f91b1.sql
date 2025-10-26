-- Update RLS policy on reviews table to require authentication
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;

CREATE POLICY "Authenticated users can view reviews" 
ON public.reviews 
FOR SELECT 
TO authenticated
USING (true);

-- Enable pg_cron and pg_net extensions for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule sync at 3 PM daily (15:00 UTC)
SELECT cron.schedule(
  'sync-reviews-3pm',
  '0 15 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://shruuhcwsuixvqtuallk.supabase.co/functions/v1/sync-google-reviews',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNocnV1aGN3c3VpeHZxdHVhbGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMDc5NjUsImV4cCI6MjA3Njc4Mzk2NX0.X5Ji9N9hNIdPeb6wjdkzQQuB8lTb_MnCT3ozkY2Wwk8"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Schedule sync at 9 PM daily (21:00 UTC)
SELECT cron.schedule(
  'sync-reviews-9pm',
  '0 21 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://shruuhcwsuixvqtuallk.supabase.co/functions/v1/sync-google-reviews',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNocnV1aGN3c3VpeHZxdHVhbGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMDc5NjUsImV4cCI6MjA3Njc4Mzk2NX0.X5Ji9N9hNIdPeb6wjdkzQQuB8lTb_MnCT3ozkY2Wwk8"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);