import { useState, useEffect } from "react";
import Hero from "@/components/Hero";
import MetricsCard from "@/components/MetricsCard";
import ReviewCard from "@/components/ReviewCard";
import RatingDistribution from "@/components/RatingDistribution";
import FilterBar from "@/components/FilterBar";
import { Star, TrendingUp, Users, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const Index = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    avgRating: 0,
    totalReviews: 0,
    newReviews: 0,
  });

  useEffect(() => {
    loadReviews();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("reviews-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reviews",
        },
        () => {
          loadReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadReviews = async () => {
    try {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .order("review_date", { ascending: false });

      if (error) throw error;

      setReviews(data || []);

      // Calculate stats
      if (data && data.length > 0) {
        const avgRating = data.reduce((acc, r) => acc + r.rating, 0) / data.length;
        const now = new Date();
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        const newReviews = data.filter(
          (r) => new Date(r.created_at) > thirtyDaysAgo
        ).length;

        setStats({
          avgRating: Math.round(avgRating * 10) / 10,
          totalReviews: data.length,
          newReviews,
        });
      }
    } catch (error) {
      console.error("Error loading reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Hero />
      
      <main className="container mx-auto px-6 py-12">
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-8">Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricsCard
              icon={Star}
              title="Average Rating"
              value={stats.avgRating.toFixed(1)}
              subtitle="Out of 5.0"
              trend="up"
            />
            <MetricsCard
              icon={MessageSquare}
              title="Total Reviews"
              value={stats.totalReviews.toString()}
              subtitle={`+${stats.newReviews} this month`}
              trend="up"
            />
            <MetricsCard
              icon={TrendingUp}
              title="Response Rate"
              value="94%"
              subtitle="Last 30 days"
              trend="up"
            />
            <MetricsCard
              icon={Users}
              title="New Reviews"
              value={stats.newReviews.toString()}
              subtitle="This month"
              trend="up"
            />
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          <div className="lg:col-span-2">
            <h2 className="text-3xl font-bold text-foreground mb-6">Recent Reviews</h2>
            <FilterBar />
            <div className="space-y-4">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))
              ) : reviews.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No reviews yet. Click "Sync Now" in Settings to fetch reviews.</p>
                </div>
              ) : (
                reviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    author={review.author_name}
                    rating={review.rating}
                    date={formatDate(review.review_date)}
                    text={review.review_text || "No review text"}
                    avatarUrl={review.author_photo_url}
                  />
                ))
              )}
            </div>
          </div>
          
          <div>
            <RatingDistribution />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
