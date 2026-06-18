"use client";

import type { ReactNode } from "react";
import type { HTMLMotionProps } from "motion/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";

import { cx } from "./theme";

const ease = [0.16, 1, 0.3, 1] as const;

export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className="h-full min-w-0"
        initial={reduceMotion ? false : { opacity: 0, y: 8, filter: "blur(5px)" }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, filter: "blur(3px)" }}
        transition={{ duration: 0.34, ease }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function MotionReveal({
  children,
  className = "",
  delay = 0,
  y = 10,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

export function MotionSurface({
  children,
  className = "",
  delay = 0,
  ...props
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
} & HTMLMotionProps<"section">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      {...props}
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.34, delay, ease }}
    >
      {children}
    </motion.section>
  );
}

export function MotionCard({
  children,
  className = "",
  delay = 0,
  ...props
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
} & HTMLMotionProps<"div">) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      {...props}
      className={cx("will-change-transform", className)}
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={reduceMotion ? undefined : { y: -2, scale: 1.006 }}
      whileTap={reduceMotion ? undefined : { scale: 0.995 }}
      transition={{ duration: 0.32, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

export function ActiveMotionMarker({ className, layoutId }: { className: string; layoutId: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.span
      aria-hidden
      className={className}
      layoutId={layoutId}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 44, mass: 0.8 }}
    />
  );
}
