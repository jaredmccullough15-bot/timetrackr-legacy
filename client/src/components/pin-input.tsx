import { useRef, useState, KeyboardEvent, ClipboardEvent } from "react";
import { Input } from "@/components/ui/input";

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}

export function PinInput({ length = 4, value, onChange, onComplete }: PinInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [pins, setPins] = useState<string[]>(Array(length).fill(""));

  const handleChange = (index: number, newValue: string) => {
    if (!/^\d*$/.test(newValue)) return;

    const newPins = [...pins];
    newPins[index] = newValue.slice(-1);
    setPins(newPins);

    const pinString = newPins.join("");
    onChange(pinString);

    if (newValue && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (pinString.length === length && onComplete) {
      onComplete(pinString);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pins[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, length);
    if (!/^\d+$/.test(pastedData)) return;

    const newPins = [...pins];
    pastedData.split("").forEach((char, i) => {
      if (i < length) newPins[i] = char;
    });
    setPins(newPins);

    const pinString = newPins.join("");
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
