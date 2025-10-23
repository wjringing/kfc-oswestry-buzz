import heroImage from "@/assets/kfc-hero.jpg";
import { Star } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative h-[400px] overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-secondary/95 via-secondary/80 to-transparent" />
      </div>
      
      <div className="relative container mx-auto px-6 h-full flex flex-col justify-center">
        <div className="max-w-2xl">
          <h1 className="text-5xl md:text-6xl font-bold text-primary-foreground mb-4">
            KFC Oswestry
          </h1>
          <p className="text-xl text-primary-foreground/90 mb-6">
            Google Reviews Dashboard
          </p>
          <div className="flex items-center gap-2 text-primary-foreground">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-6 h-6 fill-primary text-primary" />
              ))}
            </div>
            <span className="text-2xl font-bold">4.5</span>
            <span className="text-primary-foreground/70">• 1,234 reviews</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
