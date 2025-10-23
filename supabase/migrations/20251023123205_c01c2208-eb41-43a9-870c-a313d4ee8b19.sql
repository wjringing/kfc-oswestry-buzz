-- Create reviews table to store Google reviews
CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  google_review_id text UNIQUE NOT NULL,
  author_name text NOT NULL,
  author_photo_url text,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  review_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create notification_settings table
CREATE TABLE public.notification_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_number text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notify_on_rating integer[] DEFAULT ARRAY[1,2,3],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create sync_log table to track review syncs
CREATE TABLE public.sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  synced_at timestamptz NOT NULL DEFAULT now(),
  reviews_fetched integer NOT NULL DEFAULT 0,
  new_reviews integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  error_message text
);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- Public read access for reviews (anyone can view)
CREATE POLICY "Anyone can view reviews"
ON public.reviews
FOR SELECT
USING (true);

-- Only authenticated users can manage notification settings
CREATE POLICY "Users can view notification settings"
ON public.notification_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert notification settings"
ON public.notification_settings
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can update notification settings"
ON public.notification_settings
FOR UPDATE
TO authenticated
USING (true);

-- Only authenticated users can view sync logs
CREATE POLICY "Users can view sync logs"
ON public.sync_log
FOR SELECT
TO authenticated
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Enable realtime for reviews table
ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;