import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-input border border-border-strong rounded-xl px-3.5 py-2.5 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full bg-input border border-border-strong rounded-xl px-3.5 py-2.5 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y',
          className,
        )}
        {...props}
      />
    );
  },
);
