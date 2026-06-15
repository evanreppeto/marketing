"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

import { cx } from "./theme";

type DottedSurfaceProps = Omit<React.ComponentProps<"div">, "ref">;

const DOT_COLOR = 0xaeb5c2;
const DOT_SIZE = 4;
const DOT_OPACITY = 0.55;
const FOG_COLOR = 0x16161a;
const WAVE_AMPLITUDE = 40;
const WAVE_SPEED = 0.06;

const SEPARATION = 150;
const AMOUNTX = 40;
const AMOUNTY = 60;

/**
 * Ambient animated dot field behind page content. It sizes to its container,
 * pauses when hidden, and renders one static frame for reduced motion.
 */
export function DottedSurface({ className, ...props }: DottedSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "reduced";

    const getRenderSize = () => ({
      width: window.innerWidth,
      height: Math.max(container.clientHeight, window.innerHeight),
    });
    const { width, height } = getRenderSize();

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG_COLOR, 1500, 7000);

    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 10000);
    camera.position.set(0, 355, 1220);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(FOG_COLOR, 0);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0 auto auto 0";
    renderer.domElement.style.maxWidth = "none";
    container.appendChild(renderer.domElement);

    const positions: number[] = [];
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions.push(
          ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
          0,
          iy * SEPARATION - (AMOUNTY * SEPARATION) / 2,
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: DOT_COLOR,
      size: DOT_SIZE,
      transparent: true,
      opacity: DOT_OPACITY,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const positionArray = geometry.attributes.position.array as Float32Array;
    let count = 0;
    let animationId = 0;

    const renderFrame = () => {
      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          positionArray[i * 3 + 1] =
            Math.sin((ix + count) * 0.3) * WAVE_AMPLITUDE +
            Math.sin((iy + count) * 0.5) * WAVE_AMPLITUDE;
          i++;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      count += WAVE_SPEED;
    };

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      renderFrame();
    };

    const start = () => {
      if (!animationId) animate();
    };
    const stop = () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = 0;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else if (!prefersReducedMotion) start();
    };

    const handleResize = () => {
      const { width: w, height: h } = getRenderSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (prefersReducedMotion) renderFrame();
    };
    window.addEventListener("resize", handleResize);

    if (prefersReducedMotion) {
      renderFrame();
    } else {
      document.addEventListener("visibilitychange", handleVisibility);
      start();
    }

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
      {...props}
    />
  );
}
