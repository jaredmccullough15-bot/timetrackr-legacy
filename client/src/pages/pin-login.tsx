import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/components/pin-input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Lock } from "lucide-react";
import type { User } from "@shared/schema";

export default function PinLogin() {
  const [, setLocation] = useLocation();
  const [pin, setPin] = useState("");
  const { toast } = useToast();

  const pinLoginMutation = useMutation({
    mutationFn: async ({ pin }: { pin: string }) => {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
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

  const handlePinComplete = (value: string) => {
    setPin(value);
    pinLoginMutation.mutate({ pin: value });
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
          <CardTitle>Clock In/Out</CardTitle>
          <CardDescription>
            Enter your 4-digit PIN to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <PinInput
              value={pin}
              onChange={setPin}
              onComplete={handlePinComplete}
            />
          </div>
          
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
