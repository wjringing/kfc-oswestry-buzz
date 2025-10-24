import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Bell, BellOff } from "lucide-react";
import { Link } from "react-router-dom";

const Settings = () => {
  const [chatId, setChatId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notifyRatings, setNotifyRatings] = useState<number[]>([1, 2, 3]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setChatId(data.telegram_chat_id);
        setPlaceId(data.place_id || "");
        setIsActive(data.is_active);
        setNotifyRatings(data.notify_on_rating || [1, 2, 3]);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const handleSave = async () => {
    if (!chatId.trim()) {
      toast.error("Please enter your Telegram chat ID");
      return;
    }
    
    if (!placeId.trim()) {
      toast.error("Please enter your Google Place ID");
      return;
    }

    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("notification_settings")
        .select("id")
        .single();

      if (existing) {
        await supabase
          .from("notification_settings")
          .update({
            telegram_chat_id: chatId,
            place_id: placeId,
            is_active: isActive,
            notify_on_rating: notifyRatings,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("notification_settings").insert({
          telegram_chat_id: chatId,
          place_id: placeId,
          is_active: isActive,
          notify_on_rating: notifyRatings,
        });
      }

      toast.success("Settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-reviews");

      if (error) {
        console.error("Sync error:", error);
        toast.error(`Failed to sync: ${error.message || 'Unknown error'}`);
        return;
      }

      if (data?.error) {
        toast.error(`Failed to sync: ${data.error}`);
        return;
      }

      toast.success(
        `Synced ${data.new_reviews} new reviews out of ${data.reviews_fetched} total`
      );
    } catch (error) {
      console.error("Error syncing reviews:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to sync reviews: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleRating = (rating: number) => {
    if (notifyRatings.includes(rating)) {
      setNotifyRatings(notifyRatings.filter((r) => r !== rating));
    } else {
      setNotifyRatings([...notifyRatings, rating].sort());
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <h1 className="text-4xl font-bold text-foreground mb-8">Settings</h1>

        <div className="grid gap-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Telegram Notifications</CardTitle>
              <CardDescription>
                Configure your Telegram bot to receive instant notifications for new reviews
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="placeId">Google Place ID</Label>
                <Input
                  id="placeId"
                  placeholder="e.g., ChIJN1t_tDeuEmsRUsoyG83frY4"
                  value={placeId}
                  onChange={(e) => setPlaceId(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Find your KFC Place ID:{" "}
                  <a
                    href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Search here
                  </a>
                  {" "}or use{" "}
                  <a
                    href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Place ID Finder
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="chatId">Telegram Chat ID</Label>
                <Input
                  id="chatId"
                  placeholder="Your Telegram chat ID"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Send a message to{" "}
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    @userinfobot
                  </a>{" "}
                  on Telegram to get your chat ID
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="active"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked as boolean)}
                />
                <Label htmlFor="active" className="flex items-center gap-2">
                  {isActive ? (
                    <Bell className="h-4 w-4 text-primary" />
                  ) : (
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  Enable notifications
                </Label>
              </div>

              <div className="space-y-3">
                <Label>Notify me for these ratings:</Label>
                <div className="flex gap-3">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <div key={rating} className="flex items-center space-x-2">
                      <Checkbox
                        id={`rating-${rating}`}
                        checked={notifyRatings.includes(rating)}
                        onCheckedChange={() => toggleRating(rating)}
                      />
                      <Label htmlFor={`rating-${rating}`} className="cursor-pointer">
                        {rating}⭐
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleSave} disabled={loading} className="w-full">
                {loading ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sync Reviews</CardTitle>
              <CardDescription>
                Manually sync reviews from Google Places
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleSync} disabled={isSyncing} variant="outline" className="w-full">
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
