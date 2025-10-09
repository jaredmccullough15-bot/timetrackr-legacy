import { useRef, useEffect, KeyboardEvent, ClipboardEvent } from "react";
import { Input } from "@/components/ui/input";

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}

export function PinInput({ length = 4, value, onChange, onComplete }: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  const pins = Array.from({ length }, (_, i) => value[i] || "");

  useEffect(() => {
    if (value === "") {
      inputRefs.current[0]?.focus();
    }
  }, [value]);

  const handleChange = (index: number, newValue: string) => {
    if (!/^\d*$/.test(newValue)) return;

    const newPins = [...pins];
    newPins[index] = newValue.slice(-1);

    const pinString = newPins.join("").replace(/\s/g, "");
    onChange(pinString);

    if (newValue && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (pinString.length === length && onComplete) {
      onComplete(pinString);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!pins[index] && index > 0) {
        const newPins = [...pins];
        newPins[index - 1] = "";
        const pinString = newPins.join("").replace(/\s/g, "");
        onChange(pinString);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newPins = [...pins];
        newPins[index] = "";
        const pinString = newPins.join("").replace(/\s/g, "");
        onChange(pinString);
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, length);
    if (!/^\d+$/.test(pastedData)) return;

    const newPins = Array(length).fill("");
    pastedData.split("").forEach((char, i) => {
      if (i < length) newPins[i] = char;
    });

    const pinString = newPins.join("").replace(/\s/g, "");
    onChange(pinString);

    if (pastedData.length === length && onComplete) {
      onComplete(pinString);
    }

    const nextEmptyIndex = newPins.findIndex((p) => !p);
    const focusIndex = nextEmptyIndex === -1 ? length - 1 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {pins.map((pin, index) => (
        <Input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={pin}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="w-12 h-12 text-center text-lg font-semibold"
          data-testid={`input-pin-${index}`}
        />
      ))}
    </div>
  );
}
