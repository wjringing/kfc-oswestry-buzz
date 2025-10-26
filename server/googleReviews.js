import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export async function fetchGoogleReviews() {
  const { SERPAPI_KEY, GOOGLE_PLACE_ID } = process.env;
  const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${GOOGLE_PLACE_ID}&api_key=${SERPAPI_KEY}`;

  const res = await axios.get(url);
  return res.data.reviews?.map(r => ({
    user: r.user?.name,
    rating: r.rating,
    snippet: r.snippet,
    date: r.date,
  })) || [];
}
