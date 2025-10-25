-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Users can insert notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Users can update notification settings" ON notification_settings;

-- Create new permissive policies for anonymous access
CREATE POLICY "Anyone can view notification settings"
  ON notification_settings
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert notification settings"
  ON notification_settings
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can update notification settings"
  ON notification_settings
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);