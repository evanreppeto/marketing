"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";

import { AppWindow } from "./app-window";
import { GhostCta, GoldCta } from "./cta";
import {
  FinalCta,
  HowItWorks,
  Intelligence,
  LandingFooter,
  TrustBand,
} from "./landing-sections";
import { ScrollSequence } from "./scroll-sequence";
import { ShowcaseTabs } from "./showcase-tabs";
import { StudioShowcase } from "./studio-showcase";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#approvals", label: "Approvals" },
];

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 12));

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled
          ? "border-b border-[color:var(--border-panel)] bg-[color:color-mix(in_srgb,var(--canvas)_82%,transparent)] backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Arc Studio — back to top">
          <img src="/icon.png" alt="" className="h-7 w-auto" />
          <img src="/brand/arc-studio-wordmark.png" alt="Arc Studio" className="h-[1.15rem] w-auto" />
        </a>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Page sections">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[0.875rem] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="flex min-h-[38px] items-center rounded-lg px-3.5 text-[0.875rem] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Sign in
          </Link>
          <GoldCta href="/sign-up" size="sm">
            Get started
          </GoldCta>
        </div>
      </div>
    </header>
  );
}

// The floating approval card: Arc's signature object, drifting gently over the
// hero's product screenshot. Reduced motion pins it in place.
function HeroApprovalCard() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="pointer-events-none absolute -top-10 right-[-1.5rem] z-10 hidden w-[19rem] lg:block xl:right-[-3rem]"
      initial={reduced ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: 0.35, duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <motion.div
        animate={reduced ? undefined : { y: [0, -9, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="rounded-xl border border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-panel)_88%,transparent)] p-4 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.85)] backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.82rem] font-semibold text-[var(--text-primary)]">
            Storm-response campaign
          </span>
          <span className="rounded-full border border-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[0.65rem] font-medium text-[var(--accent)]">
            Needs approval
          </span>
        </div>
        <p className="mt-1.5 text-[0.72rem] leading-relaxed text-[var(--text-muted)]">
          Drafted from a weather signal · email + SMS · evidence attached
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[0.72rem] font-semibold text-[var(--on-accent)]">
            Approve
          </span>
          <span className="rounded-md border border-[color:var(--border-panel)] px-3 py-1.5 text-[0.72rem] font-medium text-[var(--text-secondary)]">
            Revise
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

// The hero's real product shot: a live capture of the demo workspace that
// straightens out of a slight perspective tilt as it scrolls into view.
function HeroProductShot() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 95%", "start 35%"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0.55, 1]);

  return (
    <div ref={ref} className="relative mt-24 [perspective:1400px]">
      <motion.div style={reduced ? undefined : { rotateX, scale, opacity, transformOrigin: "center top" }}>
        <div className="relative">
          <HeroApprovalCard />
          <AppWindow
            src="/brand/landing/app/home.png"
            alt="The Arc home screen: waiting approvals, the top opportunity with evidence, live signals, and recent agent activity"
            title="arc — your workspace"
          />
        </div>
      </motion.div>
      {/* Ground the window into the next section */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-32 bg-gradient-to-t from-[var(--canvas)] to-transparent" aria-hidden />
    </div>
  );
}

function Hero() {
  const reduced = useReducedMotion();
  const heroIntroRef = useRef<HTMLVideoElement>(null);
  const heroLoopRef = useRef<HTMLVideoElement>(null);
  const [heroPhase, setHeroPhase] = useState<"intro" | "loop">("intro");
  const { scrollY } = useScroll();
  const artY = useTransform(scrollY, [0, 720], [0, 130]);
  const fadeOut = useTransform(scrollY, [0, 600], [1, 0.45]);

  const entrance = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 26, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { delay, duration: 0.8, ease: [0.22, 0.61, 0.36, 1] as const },
        };

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Higgsfield-generated molten-gold ribbon in two acts, parallaxed
          behind the headline: the intro film plays once (the ribbon flows in
          from the top right), then hands off to a loop whose start/end frames
          match the intro's final frame (Kling start_image = end_image), so
          the motion never stops and never hard-resets. Reduced motion gets
          the poster still. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={reduced ? undefined : { y: artY, opacity: fadeOut }}
        aria-hidden
      >
        <img
          src="/brand/landing/hero-wave-poster.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
        {!reduced && (
          <>
            {/* The handoff overlaps rather than cuts: ~1s before the intro
                ends, the loop starts playing underneath and the intro fades
                out over that same second. Both show near-identical ribbon
                poses at the boundary, so the exchange reads as one motion. */}
            <motion.video
              ref={heroLoopRef}
              src="/brand/landing/hero-wave-loop.mp4"
              muted
              loop
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full object-cover"
              onViewportEnter={() => {
                if (heroPhase === "loop") void heroLoopRef.current?.play().catch(() => {});
              }}
              onViewportLeave={() => {
                heroLoopRef.current?.pause();
                heroIntroRef.current?.pause();
              }}
            />
            <video
              ref={heroIntroRef}
              src="/brand/landing/hero-wave-intro.mp4"
              muted
              playsInline
              autoPlay
              preload="auto"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1100ms] ease-in-out ${
                heroPhase === "intro" ? "opacity-100" : "opacity-0"
              }`}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (heroPhase === "intro" && v.duration && v.currentTime > v.duration - 1.1) {
                  void heroLoopRef.current?.play().catch(() => {});
                  setHeroPhase("loop");
                }
              }}
            />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--canvas)]/90 via-[var(--canvas)]/30 to-[var(--canvas)]" />
      </motion.div>

      <div className="relative mx-auto flex max-w-6xl flex-col justify-center px-6 pb-10 pt-40">
        <motion.h1
          {...entrance(0.08)}
          className="max-w-[17ch] font-serif text-[2.9rem] font-semibold leading-[1.06] text-[var(--text-primary)] sm:text-[3.9rem] lg:text-[4.6rem]"
        >
          Marketing that runs itself.{" "}
          <span className="text-[var(--accent)]">Decisions that stay yours.</span>
        </motion.h1>

        <motion.p
          {...entrance(0.22)}
          className="mt-7 max-w-[58ch] text-[1.05rem] leading-relaxed text-[var(--text-secondary)]"
        >
          Arc finds source-backed opportunities, drafts complete campaigns, and
          prepares the creative — then brings everything to you for approval.
          Nothing reaches a customer until you say so.
        </motion.p>

        <motion.div {...entrance(0.36)} className="mt-10 flex flex-wrap items-center gap-3.5">
          <GoldCta href="/sign-up">Get started</GoldCta>
          <GhostCta href="/login">Sign in</GhostCta>
        </motion.div>

        <HeroProductShot />
      </div>
    </section>
  );
}

export function LandingView() {
  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--text-primary)]">
      <LandingNav />
      <Hero />
      <ScrollSequence />
      <ShowcaseTabs />
      <HowItWorks />
      <Intelligence />
      <StudioShowcase />
      <TrustBand />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}
