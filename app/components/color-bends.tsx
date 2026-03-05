'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import * as THREE from 'three';

type ColorBendsProps = {
  className?: string;
  style?: CSSProperties;
  rotation?: number;
  speed?: number;
  colors?: string[];
  transparent?: boolean;
  autoRotate?: number;
  scale?: number;
  frequency?: number;
  warpStrength?: number;
  mouseInfluence?: number;
  parallax?: number;
  noise?: number;
};

const MAX_COLORS = 8 as const;

const fragmentShader = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

  vec3 col = vec3(0.0);
  float a = 1.0;

  if (uColorCount > 0) {
    vec2 s = q;
    vec3 sumCol = vec3(0.0);
    float cover = 0.0;
    for (int i = 0; i < MAX_COLORS; ++i) {
      if (i >= uColorCount) break;
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float m = mix(m0, m1, kMix);
      float w = 1.0 - exp(-6.0 / exp(6.0 * m));
      sumCol += uColors[i] * w;
      cover = max(cover, w);
    }
    col = clamp(sumCol, 0.0, 1.0);
    a = uTransparent > 0 ? cover : 1.0;
  } else {
    vec2 s = q;
    for (int k = 0; k < 3; ++k) {
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float m = mix(m0, m1, kMix);
      col[k] = 1.0 - exp(-6.0 / exp(6.0 * m));
    }
    a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
  }

  float grad = clamp(0.6 + 0.4 * (rp.x * 0.5 - rp.y * 0.3), 0.0, 1.0);
  vec3 base = mix(vec3(0.01, 0.03, 0.035), vec3(0.02, 0.16, 0.17), grad);
  col = mix(base, col, 0.9);

  float bandCenter = rp.y + 0.22;
  float band = smoothstep(0.55, 0.0, abs(bandCenter));
  band = pow(band, 3.0);
  col += band * 0.18 * vec3(0.6, 0.95, 0.98);

  vec3 dx = dFdx(col);
  vec3 dy = dFdy(col);
  float edgeStrength = length(dx) + length(dy);
  float edge = pow(smoothstep(0.006, 0.07, edgeStrength), 0.6);
  col = mix(col, vec3(1.0), edge * 0.6);

  float vig = smoothstep(1.3, 0.25, length(p));
  col *= mix(0.65, 1.0, vig);

  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
  }

  vec3 rgb = (uTransparent > 0) ? col * a : col;
  gl_FragColor = vec4(rgb, a);
}
`;

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const toVec3 = (hex: string) => {
  const normalized = hex.replace('#', '').trim();
  const values =
    normalized.length === 3
      ? [
          parseInt(normalized[0] + normalized[0], 16),
          parseInt(normalized[1] + normalized[1], 16),
          parseInt(normalized[2] + normalized[2], 16),
        ]
      : [
          parseInt(normalized.slice(0, 2), 16),
          parseInt(normalized.slice(2, 4), 16),
          parseInt(normalized.slice(4, 6), 16),
        ];

  return new THREE.Vector3(values[0] / 255, values[1] / 255, values[2] / 255);
};

export function ColorBends({
  className,
  style,
  rotation = 45,
  speed = 0.2,
  colors = [],
  transparent = true,
  autoRotate = 0,
  scale = 1,
  frequency = 1,
  warpStrength = 1,
  mouseInfluence = 1,
  parallax = 0.5,
  noise = 0.1,
}: ColorBendsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pointerTargetRef = useRef(new THREE.Vector2(0, 0));
  const pointerCurrentRef = useRef(new THREE.Vector2(0, 0));
  const pointerSmoothRef = useRef(8);

  const propsRef = useRef({
    rotation,
    autoRotate,
    speed,
    scale,
    frequency,
    warpStrength,
    mouseInfluence,
    parallax,
    noise,
    transparent,
  });
  propsRef.current = {
    rotation,
    autoRotate,
    speed,
    scale,
    frequency,
    warpStrength,
    mouseInfluence,
    parallax,
    noise,
    transparent,
  };

  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const uColors = Array.from({ length: MAX_COLORS }, () => new THREE.Vector3(0, 0, 0));
    const initialColors = (colorsRef.current || [])
      .filter(Boolean)
      .slice(0, MAX_COLORS)
      .map(toVec3);
    for (let i = 0; i < initialColors.length; i += 1) {
      uColors[i].copy(initialColors[i]);
    }

    const initialProps = propsRef.current;
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCanvas: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uSpeed: { value: initialProps.speed },
        uRot: { value: new THREE.Vector2(1, 0) },
        uColorCount: { value: initialColors.length },
        uColors: { value: uColors },
        uTransparent: { value: initialProps.transparent ? 1 : 0 },
        uScale: { value: initialProps.scale },
        uFrequency: { value: initialProps.frequency },
        uWarpStrength: { value: initialProps.warpStrength },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uMouseInfluence: { value: initialProps.mouseInfluence },
        uParallax: { value: initialProps.parallax },
        uNoise: { value: initialProps.noise },
      },
      premultipliedAlpha: true,
      transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, initialProps.transparent ? 0 : 1);
    renderer.domElement.dataset.engine = `three.js r${THREE.REVISION}`;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      (material.uniforms.uCanvas.value as THREE.Vector2).set(width, height);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resizeObserverRef.current = observer;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
      pointerTargetRef.current.set(x, y);
    };

    const handlePointerLeave = () => {
      pointerTargetRef.current.set(0, 0);
    };

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerleave', handlePointerLeave);

    const clock = new THREE.Clock();
    let lastColorRef: string[] | undefined;

    const render = () => {
      const props = propsRef.current;
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;

      material.uniforms.uTime.value = elapsed;
      material.uniforms.uSpeed.value = props.speed;
      material.uniforms.uScale.value = props.scale;
      material.uniforms.uFrequency.value = props.frequency;
      material.uniforms.uWarpStrength.value = props.warpStrength;
      material.uniforms.uMouseInfluence.value = props.mouseInfluence;
      material.uniforms.uParallax.value = props.parallax;
      material.uniforms.uNoise.value = props.noise;
      material.uniforms.uTransparent.value = props.transparent ? 1 : 0;

      if (colorsRef.current !== lastColorRef) {
        lastColorRef = colorsRef.current;
        const nextColors = (colorsRef.current || [])
          .filter(Boolean)
          .slice(0, MAX_COLORS)
          .map(toVec3);
        const uniformColors = material.uniforms.uColors.value as THREE.Vector3[];
        for (let i = 0; i < MAX_COLORS; i += 1) {
          const color = uniformColors[i];
          if (i < nextColors.length) color.copy(nextColors[i]);
          else color.set(0, 0, 0);
        }
        material.uniforms.uColorCount.value = nextColors.length;
      }

      renderer.setClearColor(0x000000, props.transparent ? 0 : 1);

      const deg = (props.rotation % 360) + props.autoRotate * elapsed;
      const rad = (deg * Math.PI) / 180;
      (material.uniforms.uRot.value as THREE.Vector2).set(Math.cos(rad), Math.sin(rad));

      const currentPointer = pointerCurrentRef.current;
      const targetPointer = pointerTargetRef.current;
      const amount = Math.min(1, delta * pointerSmoothRef.current);
      currentPointer.lerp(targetPointer, amount);
      (material.uniforms.uPointer.value as THREE.Vector2).copy(currentPointer);

      renderer.render(scene, camera);
      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }

      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);

      geometry.dispose();
      material.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className ? `color-bends ${className}` : 'color-bends'}
      style={style}
    />
  );
}
