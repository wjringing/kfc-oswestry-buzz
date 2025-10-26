import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req: Request) => {
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
    console.log(`Using Place ID: ${placeId}`);
    
    const apiKey = Deno.env.get("SERPAPI_API_KEY");
    
    if (!apiKey) {
      throw new Error("SerpAPI key not configured");
    }

    let allReviews: GooglePlaceReview[] = [];
    let nextPageToken: string | null = null;
    let pageCount = 0;
    const maxPages = 10;

    do {
      const serpUrl: string = nextPageToken
       ? `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${placeId}&sort_by=newestFirst&next_page_token=${nextPageToken}&api_key=${apiKey}`
       : `https://serpapi.com/search.json?engine=google_maps_reviews&place_id=${placeId}&sort_by=newestFirst&api_key=${apiKey}`;

      console.log(`Fetching reviews page ${pageCount + 1} from: ${serpUrl.replace(apiKey, 'HIDDEN')}`);
      const serpResponse: Response = await fetch(serpUrl);
      const serpData: any = await serpResponse.json();

      if (serpData.error) {
        throw new Error(`SerpAPI error: ${serpData.error}`);
      }

      const pageReviews = (serpData.reviews || []).map((review: any) => {
        let timestamp: number;
        try {
          if (review.iso_date_of_last_edit) {
            timestamp = new Date(review.iso_date_of_last_edit).getTime() / 1000;
          } else if (review.date) {
            const parsed = new Date(review.date);
            timestamp = isNaN(parsed.getTime()) ? Date.now() / 1000 : parsed.getTime() / 1000;
          } else {
            timestamp = Date.now() / 1000;
          }
        } catch (e) {
          console.error("Error parsing date:", e, "review:", review);
          timestamp = Date.now() / 1000;
        }

        return {
          author_name: review.user?.name || "Anonymous",
          author_url: review.user?.link || "",
          language: review.language || "en",
          profile_photo_url: review.user?.thumbnail || "",
          rating: review.rating || 0,
          relative_time_description: review.date || "",
          text: review.snippet || review.review || "",
          time: timestamp,
        };
      });

      allReviews = [...allReviews, ...pageReviews];
      nextPageToken = serpData.serpapi_pagination?.next_page_token || null;
      pageCount++;

      console.log(`Fetched page ${pageCount}: ${pageReviews.length} reviews (total: ${allReviews.length})`);

      if (nextPageToken && pageCount < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } while (nextPageToken && pageCount < maxPages);

    const reviews = allReviews;
    console.log(`Fetched total of ${reviews.length} reviews from Google Places`);

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