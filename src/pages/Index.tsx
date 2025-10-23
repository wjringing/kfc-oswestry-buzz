import Hero from "@/components/Hero";
import MetricsCard from "@/components/MetricsCard";
import ReviewCard from "@/components/ReviewCard";
import RatingDistribution from "@/components/RatingDistribution";
import FilterBar from "@/components/FilterBar";
import { Star, TrendingUp, Users, MessageSquare } from "lucide-react";
import { mockReviews } from "@/data/mockReviews";

const Index = () => {
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
              value="4.5"
              subtitle="Out of 5.0"
              trend="up"
            />
            <MetricsCard
              icon={MessageSquare}
              title="Total Reviews"
              value="1,234"
              subtitle="+47 this month"
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
              value="47"
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
              {mockReviews.map((review) => (
                <ReviewCard key={review.id} {...review} />
              ))}
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
