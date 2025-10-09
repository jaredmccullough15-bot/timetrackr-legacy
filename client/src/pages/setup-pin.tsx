import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/components/pin-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Lock } from "lucide-react";
import type { User } from "@shared/schema";

export default function SetupPin() {
  const [, setLocation] = useLocation();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const { toast } = useToast();

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const setupPinMutation = useMutation({
    mutationFn: async (pinValue: string) => {
      return apiRequest("POST", "/api/auth/setup-pin", { pin: pinValue });
    },
    onSuccess: () => {
      toast({
        title: "PIN Setup Complete",
        description: "You can now use your PIN to log in quickly!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      if (user?.role === "admin" || user?.role === "manager") {
        setLocation("/admin");
      } else {
        setLocation("/dashboard");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive",
      });
      setPin("");
      setConfirmPin("");
      setStep("enter");
    },
  });

  const handlePinComplete = (value: string) => {
    if (step === "enter") {
      setPin(value);
      setStep("confirm");
      setConfirmPin("");
    } else {
      setConfirmPin(value);
      if (value === pin) {
        setupPinMutation.mutate(value);
      } else {
        toast({
          title: "PINs Don't Match",
          description: "Please try again.",
          variant: "destructive",
        });
        setPin("");
        setConfirmPin("");
        setStep("enter");
      }
    }
  };

  const handleSkip = () => {
    if (user?.role === "admin" || user?.role === "manager") {
      setLocation("/admin");
    } else {
      setLocation("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Setup Your PIN</CardTitle>
          <CardDescription>
            {step === "enter"
              ? "Create a 4-digit PIN for quick login"
              : "Confirm your PIN"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PinInput
            value={step === "enter" ? pin : confirmPin}
            onChange={step === "enter" ? setPin : setConfirmPin}
            onComplete={handlePinComplete}
          />
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSkip}
              disabled={setupPinMutation.isPending}
              data-testid="button-skip-pin"
            >
              Skip for Now
            </Button>
            {step === "confirm" && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep("enter");
                  setPin("");
                  setConfirmPin("");
                }}
                disabled={setupPinMutation.isPending}
                data-testid="button-back"
              >
                Back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
