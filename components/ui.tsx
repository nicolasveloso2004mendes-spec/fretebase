"use client";
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from "react";

export function PageHeader({ crumb, title, subtitle, action }: { crumb: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 no-print">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Operação / {crumb}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-pine-950 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-pine-900 text-white hover:bg-pine-800",
    ghost: "border border-line bg-white text-ink hover:bg-paper",
    danger: "border border-danger/30 bg-white text-danger hover:bg-red-50",
  }[variant];
  return <button type="button" {...p} className={`${btnBase} ${v} ${className}`} />;
}

export const linkBtn = `${btnBase} bg-pine-900 text-white hover:bg-pine-800`;
export const linkBtnGhost = `${btnBase} border border-line bg-white text-ink hover:bg-paper`;

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white p-5 sm:p-6 ${className}`}>{children}</section>;
}

const inputCls =
  "mt-1.5 block min-h-11 w-full rounded-xl border border-line bg-white px-3.5 text-base text-ink placeholder:text-muted/70 focus:border-pine-700";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-pine-900">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${inputCls} ${p.className ?? ""}`} />;
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${inputCls} py-2.5 ${p.className ?? ""}`} rows={p.rows ?? 3} />;
}

export function Loading({ text = "Carregando…" }: { text?: string }) {
  return <p role="status" className="py-10 text-center text-muted">{text}</p>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-red-50 p-5 text-danger">
      <p className="font-semibold">Algo deu errado</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <Button variant="ghost" className="mt-3" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center">
      <p className="text-lg font-bold text-pine-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-muted">{text}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const tones: Record<string, string> = {
  neutral: "bg-paper text-muted border-line",
  good: "bg-green-50 text-green-800 border-green-200",
  warn: "bg-amber-50 text-warn border-amber-200",
  bad: "bg-red-50 text-danger border-red-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="tnum mt-2 text-2xl font-extrabold text-pine-950">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
