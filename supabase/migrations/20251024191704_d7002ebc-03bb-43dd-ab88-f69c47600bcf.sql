-- Add place_id column to notification_settings
ALTER TABLE public.notification_settings 
ADD COLUMN place_id text;