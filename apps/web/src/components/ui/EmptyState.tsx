import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
};

export function EmptyState({ title, description, action, icon, compact }: Props) {
  return (
    <div className={`empty-state${compact ? ' empty-state-compact' : ''}`}>
      {icon ? <div className="empty-state-icon" aria-hidden>{icon}</div> : null}
      <div className="empty-state-body">
        <strong>{title}</strong>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
