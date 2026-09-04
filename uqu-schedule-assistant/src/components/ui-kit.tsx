"use client";
import React, { useEffect, useRef } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export const Card = ({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) => (
  <section className={`card ${className}`} id={id}>
    {children}
  </section>
);

export const Button = ({ children, className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={`button ${className}`} {...p}>
    {children}
  </button>
);

export const Badge = ({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) => (
  <span className={`badge ${tone}`}>{children}</span>
);

export const Loading = () => (
  <div className="loading">
    <RefreshCw className="spin" />
    Loading local schedule…
  </div>
);

export const Empty = ({ text }: { text: string }) => (
  <div className="empty">
    <p>{text}</p>
  </div>
);

export const PageTitle = ({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) => (
  <div className="page-title">
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    {actions ? <div className="toolbar">{actions}</div> : null}
  </div>
);

export type FormError = { field: string; message: string };

/**
 * Error summary shown at the top of a failed form.
 * It takes keyboard focus after a failed submission and every item links to the
 * field or record it describes, so red borders alone are never the only signal.
 */
export function ErrorSummary({ errors, title = "Fix these before continuing" }: { errors: FormError[]; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [errors]);
  if (!errors.length) return null;
  return (
    <div className="error-summary" tabIndex={-1} ref={ref} role="alert" aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">
        <AlertTriangle aria-hidden="true" /> {title} ({errors.length})
      </h2>
      <ul>
        {errors.map((error) => (
          <li key={`${error.field}-${error.message}`}>
            <a
              href={`#${error.field}`}
              onClick={(event) => {
                event.preventDefault();
                const target = document.getElementById(error.field);
                target?.focus();
                target?.scrollIntoView({ block: "center" });
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Inline error kept beside its field, in addition to the summary. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span className="field-error" id={`${id}-error`}>
      <AlertTriangle aria-hidden="true" /> {message}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Section({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

/** Modal-style confirmation used for impact previews and destructive actions. */
export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="dialog-scrim" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <label className="toggle">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Trigger a local file download without contacting any external service. */
export function downloadBlob(filename: string, data: string | Uint8Array, type: string) {
  const part: BlobPart = typeof data === "string" ? data : new Uint8Array(data).slice().buffer;
  const blob = new Blob([part], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
