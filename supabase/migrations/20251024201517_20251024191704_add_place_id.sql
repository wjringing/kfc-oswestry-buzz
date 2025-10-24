-- Add place_id column to notification_settings
ALTER TABLE public.notification_settings 
ADD COLUMN IF NOT EXISTS place_id text;