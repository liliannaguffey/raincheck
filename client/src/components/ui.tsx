import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

type Tone = "primary" | "secondary" | "quiet";

function actionClass(tone: Tone, className?: string) {
  return ["action", `action--${tone}`, className].filter(Boolean).join(" ");
}

export function Button({
  tone = "primary",
  type = "button",
  className,
  ...props
}: ComponentProps<"button"> & { tone?: Tone }) {
  return (
    <button type={type} className={actionClass(tone, className)} {...props} />
  );
}

export function ActionLink({
  tone = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: Tone }) {
  return <Link className={actionClass(tone, className)} {...props} />;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}
