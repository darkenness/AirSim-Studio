import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon = Inbox,
  message,
  actionText,
  onAction,
}: {
  icon?: LucideIcon;
  message: string;
  actionText?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Icon className="w-10 h-10 mb-3 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-3 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
