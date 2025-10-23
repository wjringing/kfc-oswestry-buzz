import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Star } from "lucide-react";

const ratingData = [
  { stars: 5, count: 892, percentage: 72 },
  { stars: 4, count: 214, percentage: 17 },
  { stars: 3, count: 86, percentage: 7 },
  { stars: 2, count: 25, percentage: 2 },
  { stars: 1, count: 17, percentage: 2 },
];

const RatingDistribution = () => {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-foreground mb-6">Rating Distribution</h2>
      
      <div className="space-y-4">
        {ratingData.map((item) => (
          <div key={item.stars} className="flex items-center gap-4">
            <div className="flex items-center gap-1 w-16">
              <span className="text-sm font-medium text-foreground">{item.stars}</span>
              <Star className="w-4 h-4 fill-primary text-primary" />
            </div>
            
            <div className="flex-1">
              <Progress value={item.percentage} className="h-3" />
            </div>
            
            <div className="w-20 text-right">
              <span className="text-sm text-muted-foreground">{item.count}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default RatingDistribution;
