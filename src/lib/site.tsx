import { forwardRef, type AnchorHTMLAttributes } from "react";

// Two-domain layout:
//   gostay.id      → marketing landing page only (project bookme-hotel-done)
//   app.gostay.id  → the actual app: login, dashboard, guest portal (gostay-app)
//
// Both domains serve the same SPA build, so behaviour is decided at runtime by
// which host it is on. VITE_SITE_MODE, when set on a deployment, overrides the
// hostname sniff (useful for *.vercel.app preview URLs that carry no "app.").

const MODE = (import.meta.env.VITE_SITE_MODE as string | undefined)?.trim();

/** Absolute origin of the app domain, for links that must leave the landing. */
export const APP_ORIGIN =
  ((import.meta.env.VITE_APP_URL as string | undefined)?.trim()) || "https://app.gostay.id";

/** True on the app domain (app.gostay.id) — where login/dashboard/portal live. */
export function isAppHost(): boolean {
  if (MODE === "app") return true;
  if (MODE === "landing") return false;
  if (typeof window === "undefined") return false;
  return /^app\./i.test(window.location.hostname);
}

/** Local dev / same-origin: keep links relative so they work without the app domain. */
function isLocalDev(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}

/**
 * True only on the production landing domain (gostay.id) — NOT the app domain
 * and NOT local dev. This is what gates sending app routes off to app.gostay.id:
 * in dev we run the whole app on one origin, so login must stay local there.
 */
export function isLandingHost(): boolean {
  return !isAppHost() && !isLocalDev();
}

/**
 * Resolve an app path to where it should actually be opened. On the landing
 * domain this becomes an absolute URL on app.gostay.id (so "Masuk" leaves the
 * marketing site for the app); on the app domain or in dev it stays relative.
 */
export function appHref(path: string): string {
  return isAppHost() || isLocalDev() ? path : `${APP_ORIGIN}${path}`;
}

/**
 * A link to an app route that is safe to use from the landing page: it renders a
 * plain <a> so it can cross origins to app.gostay.id when needed. forwardRef so
 * it still works as a Radix <Button asChild> child.
 */
export const AppLink = forwardRef<HTMLAnchorElement, { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>>(
  function AppLink({ to, children, ...rest }, ref) {
    return (
      <a ref={ref} href={appHref(to)} {...rest}>
        {children}
      </a>
    );
  },
);
