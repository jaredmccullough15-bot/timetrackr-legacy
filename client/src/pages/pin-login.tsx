import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/pin-input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Lock, ArrowLeft } from "lucide-react";
import type { User } from "@shared/schema";

export default function PinLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);
  const { toast } = useToast();

  const pinLoginMutation = useMutation({
    mutationFn: async ({ email, pin }: { email: string; pin: string }) => {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }

      return res.json();
    },
    onSuccess: (data: { user: User }) => {
      toast({
        title: "Login Successful",
        description: `Welcome back, ${data.user.firstName}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      if (data.user.role === "admin" || data.user.role === "manager") {
        setLocation("/admin");
      } else {
        setLocation("/dashboard");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
      setPin("");
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setShowPinInput(true);
    }
  };

  const handlePinComplete = (value: string) => {
    setPin(value);
    pinLoginMutation.mutate({ email, pin: value });
  };

  const handleBack = () => {
    setShowPinInput(false);
    setPin("");
  };

  const handleBackToMain = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>PIN Login</CardTitle>
          <CardDescription>
            {showPinInput
              ? "Enter your 4-digit PIN"
              : "Enter your email address"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!showPinInput ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  data-testid="input-email"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                data-testid="button-continue"
              >
                Continue
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground mb-4">
                Logging in as <span className="font-medium text-foreground">{email}</span>
              </div>
              <PinInput
                value={pin}
                onChange={setPin}
                onComplete={handlePinComplete}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={handleBack}
                disabled={pinLoginMutation.isPending}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Change Email
              </Button>
            </div>
          )}
          
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={handleBackToMain}
              className="text-sm"
              data-testid="button-back-to-main"
            >
              Back to Login Options
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
