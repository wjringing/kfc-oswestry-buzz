-- Update notification_settings table to support Telegram
ALTER TABLE public.notification_settings 
DROP COLUMN IF EXISTS whatsapp_number;

ALTER TABLE public.notification_settings 
ADD COLUMN IF NOT EXISTS telegram_chat_id text NOT NULL DEFAULT '';

-- Add RLS policies for edge functions to insert reviews and sync logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'reviews' 
    AND policyname = 'Service role can insert reviews'
  ) THEN
    CREATE POLICY "Service role can insert reviews"
    ON public.reviews
    FOR INSERT
    TO service_role
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'sync_log' 
    AND policyname = 'Service role can insert sync logs'
  ) THEN
    CREATE POLICY "Service role can insert sync logs"
    ON public.sync_log
    FOR INSERT
    TO service_role
    WITH CHECK (true);
  END IF;
END $$;