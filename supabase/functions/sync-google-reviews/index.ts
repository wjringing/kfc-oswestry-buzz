import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GooglePlaceReview {
  author_name: string;
  author_url?: string;
  language: string;
  profile_photo_url?: string;
  rating: number;
  relative_time_description: string;
  text?: string;
  time: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("Starting Google Places review sync");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settings, error: settingsError } = await supabase
      .from("notification_settings")
      .select("place_id")
      .maybeSingle();

    if (settingsError) {
      throw new Error(`Settings error: ${settingsError.message}`);
    }

    if (!settings?.place_id) {
      throw new Error("Place ID not configured. Please set it in Settings.");
    }

    const placeId = settings.place_id;
    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    
    if (!apiKey) {
      throw new Error("Google Places API key not configured");
    }

    const placeUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}`;
    const placeResponse = await fetch(placeUrl);
    const placeData = await placeResponse.json();

    if (placeData.status !== "OK") {
      throw new Error(`Google Places API error: ${placeData.status} - ${placeData.error_message || "Unknown error"}`);
    }

    const reviews: GooglePlaceReview[] = placeData.result?.reviews || [];
    console.log(`Fetched ${reviews.length} reviews from Google Places`);

    let newReviewsCount = 0;

    for (const review of reviews) {
      const reviewId = `${placeId}_${review.time}`;
      const reviewDate = new Date(review.time * 1000);

      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("google_review_id", reviewId)
        .maybeSingle();

      if (!existing) {
        const { error: insertError } = await supabase
          .from("reviews")
          .insert({
            google_review_id: reviewId,
            author_name: review.author_name,
            author_photo_url: review.profile_photo_url,
            rating: review.rating,
            review_text: review.text,
            review_date: reviewDate.toISOString(),
          });

        if (insertError) {
          console.error("Error inserting review:", insertError);
          continue;
        }

        newReviewsCount++;
        console.log(`New review added: ${reviewId}`);

        try {
          await supabase.functions.invoke("send-telegram-notification", {
            body: {
              reviewId,
              authorName: review.author_name,
              rating: review.rating,
              reviewText: review.text,
            },
          });
        } catch (notifError) {
          console.error("Error sending notification:", notifError);
        }
      }
    }

    await supabase.from("sync_log").insert({
      reviews_fetched: reviews.length,
      new_reviews: newReviewsCount,
      status: "success",
    });

    console.log(`Sync complete: ${newReviewsCount} new reviews`);

    return new Response(
      JSON.stringify({
        success: true,
        reviews_fetched: reviews.length,
        new_reviews: newReviewsCount,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error syncing reviews:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.from("sync_log").insert({
        reviews_fetched: 0,
        new_reviews: 0,
        status: "error",
        error_message: errorMessage,
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});