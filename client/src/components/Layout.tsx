import { CloudRain } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

export function Layout() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      main.current?.focus();
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="border-b border-line bg-white">
        <div className="container-shell site-header">
          <Link className="brand" to="/">
            <span className="brand-mark">
              <CloudRain size={21} aria-hidden="true" />
            </span>
            RainCheck
          </Link>
          <nav aria-label="Main navigation" className="site-nav">
            <NavLink end to="/">
              Trip planner
            </NavLink>
            <NavLink to="/saved">Saved trips</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} ref={main} className="grow">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="container-shell py-5 text-sm text-muted">
          RainCheck · Road trip weather planner
        </div>
      </footer>
    </div>
  );
}
