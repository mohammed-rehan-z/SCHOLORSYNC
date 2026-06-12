"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "motion/react";
import { PenTool, Search, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { id: "scraper",    label: "Research",     alwaysVisible: true },
  { id: "summarizer", label: "Intelligence", alwaysVisible: true },
  { id: "dashboard",  label: "Library",      alwaysVisible: true },
  { id: "tabular",    label: "Archive",      alwaysVisible: true },
  { id: "settings",   label: "Settings",     alwaysVisible: true },
];

export function Navbar({ activeView, setActiveView, activePaper, onUploadClick }) {
  const visibleLinks = NAV_LINKS.filter(
    (l) => l.alwaysVisible || activePaper
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center items-center pointer-events-none p-4">
      <div className="pointer-events-auto bg-surface-container/80 backdrop-blur-md rounded-full mt-4 mx-auto w-fit px-6 py-2 border border-outline flex items-center gap-8 transition-all duration-300 ease-in-out shadow-sm">
        <span 
          className="font-headline-sm text-headline-sm font-bold tracking-tighter text-primary cursor-pointer"
          onClick={() => setActiveView("overview")}
        >
          ScholarSync
        </span>
        <div className="hidden md:flex gap-6 items-center">
          {visibleLinks.map((link) => {
            const isActive = activeView === link.id;
            return (
              <button
                key={link.id}
                className={`font-label-md text-label-md uppercase tracking-wider transition-colors ${
                  isActive 
                    ? "text-primary font-bold border-b border-primary pb-1" 
                    : "text-on-surface-variant hover:text-primary"
                }`}
                onClick={() => setActiveView(link.id)}
              >
                {link.label}
              </button>
            );
          })}
        </div>
        <button 
          className="bg-accent text-on-secondary-fixed font-label-md text-label-md uppercase tracking-wider px-4 py-1.5 rounded-full hover:bg-opacity-90 transition-opacity"
          onClick={onUploadClick}
        >
          {activeView === "settings" ? "Connect Identity" : "Upload Document"}
        </button>
      </div>
    </nav>
  );
}

// ─── Animated view wrapper ─────────────────────────────────────────────────
export function ViewTransition({ children, viewKey }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
