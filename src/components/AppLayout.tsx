import type { ReactNode } from "react";
import {
  Grid2X2,
  Images,
  ShieldCheck,
  ArrowRight,
  SlidersHorizontal,
  Heart,
} from "lucide-react";
import type { Page } from "../types";
export function AppLayout({
  page,
  onNavigate,
  photoCount,
  children,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  photoCount: number;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-icon">
            <Grid2X2 size={22} />
          </span>
          <span>
            memory<span className="brand-light">mosaic</span>
          </span>
        </a>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav>
          <button
            className={page === "photos" ? "active" : ""}
            onClick={() => onNavigate("photos")}
          >
            <Images size={19} />
            Photo library
            <span className="nav-count">{photoCount}</span>
          </button>
          <button
            className={page === "pieces" ? "active" : ""}
            onClick={() => onNavigate("pieces")}
          >
            <SlidersHorizontal size={19} /> Portrait pieces
          </button>
          <button
            className={page === "mosaic" ? "active" : ""}
            onClick={() => onNavigate("mosaic")}
          >
            <Grid2X2 size={19} />
            Mosaic studio
          </button>
        </nav>
        <div className="sidebar-note">
          <Heart size={21} strokeWidth={1.4} />
          <p>
            A life, made of
            <br />
            little moments.
          </p>
          <span>Bring them together.</span>
        </div>
        <div className="privacy">
          <ShieldCheck size={18} />
          <div>
            <strong>Just on your computer</strong>
            <p>No uploads. No cloud.</p>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {page === "photos"
                ? "Photo library"
                : page === "pieces"
                  ? "Portrait pieces"
                  : "Mosaic studio"}
            </strong>
          </div>
          <span className="local-badge">
            <span /> LOCAL & PRIVATE
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "photos"
                  ? "EVERY PHOTO, A MEMORY"
                  : page === "pieces"
                    ? "CHOOSE WHAT EACH PIECE TELLS"
                    : "SMALL MOMENTS. ONE BEAUTIFUL PICTURE."}
              </span>
              <h1>
                {page === "photos"
                  ? "Your collection of moments"
                  : page === "pieces"
                    ? "A portrait, piece by piece"
                    : "Bring the memories together"}
              </h1>
              <p>
                {page === "photos"
                  ? "Choose the photos that tell his story. Make each little moment count."
                  : page === "pieces"
                    ? "Select named pieces and choose the memories for each one."
                    : "Build a portrait from the people, places, and moments that made a life."}
              </p>
            </div>
            {page === "photos" && (
              <button className="primary" onClick={() => onNavigate("mosaic")}>
                Open mosaic studio <ArrowRight size={17} />
              </button>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
