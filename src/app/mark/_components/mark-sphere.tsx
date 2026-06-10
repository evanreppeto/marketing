"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/app/_components/theme";
import { MarkOrb } from "./mark-orb";

/**
 * Mark's profile sphere — the 21st.dev plasma shader, recolored to Signal gold
 * and shaped into a lit 3D sphere (in-shader limb darkening + specular).
 *
 * One shared WebGL context renders the shader to a single offscreen canvas; each
 * <MarkSphere> is a lightweight 2D canvas that copies that frame. This is what
 * lets the sphere appear on every message without blowing the browser's WebGL
 * context limit (a per-instance GL context would start blanking out). Falls back
 * to the CSS <MarkOrb> when WebGL is unavailable.
 */

const VERT = `attribute vec4 aPos; void main(){ gl_Position = aPos; }`;

const FRAG = `precision highp float;
uniform vec2 iResolution;
uniform float iTime;

const float overallSpeed = 0.2;
const float gridSmoothWidth = 0.015;
const float majorLineWidth = 0.025;
const float minorLineWidth = 0.0125;
const float majorLineFrequency = 5.0;
const float minorLineFrequency = 1.0;
const float scale = 4.0;
const vec4 lineColor = vec4(0.83, 0.66, 0.30, 1.0); // Signal gold
const float minLineWidth = 0.01;
const float maxLineWidth = 0.20;
const float lineSpeed = 1.0 * overallSpeed;
const float lineAmplitude = 1.0;
const float lineFrequency = 0.2;
const float warpSpeed = 0.2 * overallSpeed;
const float warpFrequency = 0.5;
const float warpAmplitude = 1.0;
const float offsetFrequency = 0.5;
const float offsetSpeed = 1.33 * overallSpeed;
const float minOffsetSpread = 0.6;
const float maxOffsetSpread = 2.0;
const int linesPerGroup = 16;

#define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
#define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
#define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))
#define drawPeriodicLine(freq, width, t) drawCrispLine(freq / 2.0, width, abs(mod(t, freq) - (freq) / 2.0))

float random(float t) {
  return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
}

float getPlasmaY(float x, float horizontalFade, float offset) {
  return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = fragCoord.xy / iResolution.xy;

  // Sphere mask + normal (treat the quad as the front of a unit sphere).
  vec2 c = uv - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) { gl_FragColor = vec4(0.0); return; }
  float z = sqrt(max(0.0, 1.0 - d * d));

  vec2 space = c * 2.0 * scale;
  float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
  float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

  space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
  space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

  vec4 lines = vec4(0.0);
  vec4 bgColor1 = vec4(0.05, 0.05, 0.06, 1.0);   // obsidian
  vec4 bgColor2 = vec4(0.13, 0.10, 0.04, 1.0);   // warm dark

  for (int l = 0; l < linesPerGroup; l++) {
    float normalizedLineIndex = float(l) / float(linesPerGroup);
    float offsetTime = iTime * offsetSpeed;
    float offsetPosition = float(l) + space.x * offsetFrequency;
    float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
    float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
    float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
    float linePosition = getPlasmaY(space.x, horizontalFade, offset);
    float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

    float circleX = mod(float(l) + iTime * lineSpeed, 25.0) - 12.0;
    vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
    float circle = drawCircle(circlePosition, 0.01, space) * 4.0;

    line = line + circle;
    lines += line * lineColor * rand;
  }

  vec4 fragColor = mix(bgColor1, bgColor2, uv.x);
  fragColor *= verticalFade;
  fragColor += lines;

  // Spherical shading: limb darkening toward the edge + a soft specular highlight.
  fragColor.rgb *= mix(0.30, 1.18, z);
  float hi = smoothstep(0.55, 0.0, length(uv - vec2(0.36, 0.34)));
  fragColor.rgb += hi * 0.22 * vec3(1.0, 0.94, 0.82);

  float edge = smoothstep(1.0, 0.92, d);
  fragColor.a = edge;
  gl_FragColor = fragColor;
}`;

type Sub = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

const RES = 128; // offscreen render size
const subs = new Set<Sub>();
let glCanvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let timeLoc: WebGLUniformLocation | null = null;
let supported: boolean | null = null; // null = not yet probed
let running = false;
let reduced = false;
let startMs = 0;

function compile(g: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = g.createShader(type);
  if (!s) return null;
  g.shaderSource(s, src);
  g.compileShader(s);
  if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
    g.deleteShader(s);
    return null;
  }
  return s;
}

function initRenderer(): boolean {
  if (supported !== null) return supported;
  const canvas = document.createElement("canvas");
  canvas.width = RES;
  canvas.height = RES;
  const g = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: true,
  });
  if (!g) {
    supported = false;
    return false;
  }
  const vs = compile(g, g.VERTEX_SHADER, VERT);
  const fs = compile(g, g.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    supported = false;
    return false;
  }
  const prog = g.createProgram();
  g.attachShader(prog, vs);
  g.attachShader(prog, fs);
  g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
    supported = false;
    return false;
  }
  g.useProgram(prog);

  const buf = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  const loc = g.getAttribLocation(prog, "aPos");
  g.enableVertexAttribArray(loc);
  g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);

  g.uniform2f(g.getUniformLocation(prog, "iResolution"), RES, RES);
  timeLoc = g.getUniformLocation(prog, "iTime");
  g.viewport(0, 0, RES, RES);

  glCanvas = canvas;
  gl = g;
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  startMs = performance.now();
  supported = true;
  return true;
}

function renderFrame() {
  if (!gl || !glCanvas) return;
  gl.uniform1f(timeLoc, (performance.now() - startMs) / 1000);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  subs.forEach((s) => {
    const { width, height } = s.canvas;
    s.ctx.clearRect(0, 0, width, height);
    s.ctx.drawImage(glCanvas!, 0, 0, width, height);
  });
}

function loop() {
  if (!running) return;
  renderFrame();
  requestAnimationFrame(loop);
}

function registerSphere(sub: Sub): boolean {
  if (!initRenderer()) return false;
  subs.add(sub);
  if (reduced) {
    // Static: render a single frame now (and again on next tick so a freshly
    // mounted canvas with 0 size at register time still gets painted).
    renderFrame();
    requestAnimationFrame(renderFrame);
  } else if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
  return true;
}

function unregisterSphere(canvas: HTMLCanvasElement) {
  for (const s of subs) {
    if (s.canvas === canvas) {
      subs.delete(s);
      break;
    }
  }
  if (subs.size === 0) running = false;
}

export function MarkSphere({ size = 32, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx || !registerSphere({ canvas, ctx })) {
      setFallback(true);
      return;
    }
    return () => unregisterSphere(canvas);
  }, [size]);

  if (fallback) return <MarkOrb size={size} className={className} />;

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cx("block rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}
