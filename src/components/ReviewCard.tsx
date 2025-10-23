import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star } from "lucide-react";

interface ReviewCardProps {
  author: string;
  rating: number;
  date: string;
  text: string;
  avatarUrl?: string;
}

const ReviewCard = ({ author, rating, date, text, avatarUrl }: ReviewCardProps) => {
  const initials = author
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card to-card/50">
      <div className="flex items-start gap-4">
        <Avatar className="w-12 h-12">
          <AvatarImage src={avatarUrl} alt={author} />
          <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold text-foreground">{author}</h3>
              <p className="text-sm text-muted-foreground">{date}</p>
            </div>
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < rating ? "fill-primary text-primary" : "text-muted"
                  }`}
                />
              ))}
            </div>
          </div>
          
          <p className="text-foreground/80 leading-relaxed">{text}</p>
        </div>
      </div>
    </Card>
  );
};

export default ReviewCard;
