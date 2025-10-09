import { Badge } from "@/components/ui/badge";

interface ClockStatusBadgeProps {
  isClockedIn: boolean;
}

export function ClockStatusBadge({ isClockedIn }: ClockStatusBadgeProps) {
  return (
    <Badge 
      variant={isClockedIn ? "default" : "secondary"}
      className={isClockedIn ? "bg-chart-2 hover:bg-chart-2" : ""}
      data-testid={`badge-status-${isClockedIn ? 'clocked-in' : 'clocked-out'}`}
    >
      {isClockedIn ? "Clocked In" : "Clocked Out"}
    </Badge>
  );
}
