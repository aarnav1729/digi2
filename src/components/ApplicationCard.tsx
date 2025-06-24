
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface ApplicationCardProps {
  title: string;
  description: string;
  link: string;
  thumbnail?: string;
}

export function ApplicationCard({ title, description, link, thumbnail }: ApplicationCardProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleOpenApplication = () => {
    if (!isAuthenticated) {
      localStorage.setItem('redirectAfterLogin', window.location.pathname);
      navigate('/login');
    } else {
      window.open(link, "_blank");
    }
  };

  return (
    <Card className="group relative overflow-hidden p-6 glass transition-all duration-300 hover:scale-[1.02] animate-scale-in">
      <div className="relative z-10 flex h-full flex-col gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        {thumbnail && (
          <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-lg">
            <img
              src={thumbnail}
              alt={title}
              className="object-cover transition-all duration-300 group-hover:scale-105"
            />
          </div>
        )}
        <div className="mt-auto pt-4">
          <Button
            className="gap-2"
            onClick={handleOpenApplication}
          >
            Open Application
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
