import React from 'react';
import Icon from './Icon';

export function Button({ variant = 'primary', className = '', type = 'button', children, ...props }) {
  return <button type={type} className={`ui-button ui-button--${variant} ${className}`} {...props}>{children}</button>;
}
export function Badge({ tone = 'neutral', children }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
export function Alert({ children, tone = 'error' }) {
  return <div className={`ui-alert ui-alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}><Icon name="info" size={20} /><div>{children}</div></div>;
}
export function LoadingState({ message = 'Đang tải dữ liệu...' }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" /><span>{message}</span></div>;
}
export function EmptyState({ icon = 'clock', title, description, children }) {
  return <section className="empty-state"><span className="empty-state__icon"><Icon name={icon} size={30} /></span><h2>{title}</h2><p>{description}</p>{children && <div className="actions">{children}</div>}</section>;
}
