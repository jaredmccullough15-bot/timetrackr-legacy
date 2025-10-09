import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, TrendingUp, Users, DollarSign } from "lucide-react";

export default function Landing() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.role === 'admin' || user.role === 'manager') {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16 max-w-6xl">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <Clock className="w-16 h-16 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Employee Time Clock
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Professional time tracking with automated sick time accrual, payroll calculation, and comprehensive reporting
          </p>
          <Button 
            size="lg" 
            className="text-lg px-8"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-login"
          >
            Sign In to Continue
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
          <Card className="hover-elevate">
            <CardHeader className="pb-4">
              <Clock className="w-8 h-8 text-primary mb-2" />
              <CardTitle className="text-lg">Simple Clock In/Out</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                One-click time tracking with automatic timestamp recording
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="pb-4">
              <TrendingUp className="w-8 h-8 text-chart-2 mb-2" />
              <CardTitle className="text-lg">Sick Time Accrual</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Earn 1 hour of sick time for every 30 hours worked
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="pb-4">
              <DollarSign className="w-8 h-8 text-chart-3 mb-2" />
              <CardTitle className="text-lg">Payroll Calculation</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Automatic weekly paycheck calculation based on hours and pay rate
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="pb-4">
              <Users className="w-8 h-8 text-chart-4 mb-2" />
              <CardTitle className="text-lg">Admin Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Comprehensive reporting with date range filtering and exports
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
