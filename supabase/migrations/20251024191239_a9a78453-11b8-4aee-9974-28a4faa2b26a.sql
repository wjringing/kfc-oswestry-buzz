-- Update notification_settings table to support Telegram
ALTER TABLE public.notification_settings 
DROP COLUMN IF EXISTS whatsapp_number;

ALTER TABLE public.notification_settings 
ADD COLUMN telegram_chat_id text NOT NULL DEFAULT '';

-- Add RLS policies for edge functions to insert reviews and sync logs
CREATE POLICY "Service role can insert reviews"
ON public.reviews
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can insert sync logs"
ON public.sync_log
FOR INSERT
TO service_role
WITH CHECK (true);