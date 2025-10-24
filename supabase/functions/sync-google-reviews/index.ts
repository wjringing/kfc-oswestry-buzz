import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Google Places review sync');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Google Places API key
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')!;
    
    // KFC Place ID (you'll need to replace this with the actual KFC location)
    // For now, using a demo place ID - user will need to update this
    const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4'; // This is Google Sydney - replace with actual KFC
    
    // Fetch reviews from Google Places API
    const placeUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}`;
    const placeResponse = await fetch(placeUrl);
    const placeData = await placeResponse.json();

    if (placeData.status !== 'OK') {
      throw new Error(`Google Places API error: ${placeData.status}`);
    }

    const reviews: GooglePlaceReview[] = placeData.result?.reviews || [];
    console.log(`Fetched ${reviews.length} reviews from Google Places`);

    let newReviewsCount = 0;

    // Process each review
    for (const review of reviews) {
      const reviewId = `${placeId}_${review.time}`;
      const reviewDate = new Date(review.time * 1000);

      // Check if review already exists
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('google_review_id', reviewId)
        .single();

      if (!existing) {
        // Insert new review
        const { error: insertError } = await supabase
          .from('reviews')
          .insert({
            google_review_id: reviewId,
            author_name: review.author_name,
            author_photo_url: review.profile_photo_url,
            rating: review.rating,
            review_text: review.text,
            review_date: reviewDate.toISOString(),
          });

        if (insertError) {
          console.error('Error inserting review:', insertError);
          continue;
        }

        newReviewsCount++;
        console.log(`New review added: ${reviewId}`);

        // Send notification for new review
        try {
          await supabase.functions.invoke('send-telegram-notification', {
            body: {
              reviewId,
              authorName: review.author_name,
              rating: review.rating,
              reviewText: review.text,
            },
          });
        } catch (notifError) {
          console.error('Error sending notification:', notifError);
        }
      }
    }

    // Log sync
    await supabase.from('sync_log').insert({
      reviews_fetched: reviews.length,
      new_reviews: newReviewsCount,
      status: 'success',
    });

    console.log(`Sync complete: ${newReviewsCount} new reviews`);

    return new Response(
      JSON.stringify({
        success: true,
        reviews_fetched: reviews.length,
        new_reviews: newReviewsCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error syncing reviews:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed sync
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    await supabase.from('sync_log').insert({
      reviews_fetched: 0,
      new_reviews: 0,
      status: 'error',
      error_message: errorMessage,
    });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
