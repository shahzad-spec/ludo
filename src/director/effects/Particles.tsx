/**
 * Particle effect components — lightweight one-shot visual bursts (PLAN-PHASE-4 §4).
 *
 * Each effect self-removes via GSAP onComplete. The EffectManager spawns these
 * on bus events. All are Director-layer; no Oracle state.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute } from 'three';

/** A burst of small particles that fly outward and fall. Self-contained physics. */
export function ParticleBurst({
  position,
  color,
  count = 8,
  speed = 1,
  size = 0.06,
  duration = 0.4,
  onComplete,
}: {
  position: [number, number, number];
  color: string;
  count?: number;
  speed?: number;
  size?: number;
  duration?: number;
  onComplete?: () => void;
}) {
  const pointsRef = useRef<THREE.Points>(null);

  // Random velocities for each particle (outward + up)
  const velocities = useMemo(() => {
    const v: number[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const r = speed * (0.5 + Math.random() * 0.5);
      v.push(Math.cos(angle) * r, 0.5 + Math.random() * speed, Math.sin(angle) * r);
    }
    return v;
  }, [count, speed]);

  // Geometry: all particles start at the burst origin
  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position[0];
      positions[i * 3 + 1] = position[1];
      positions[i * 3 + 2] = position[2];
    }
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return geo;
  }, [count, position]);

  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    elapsed.current += delta;
    const t = elapsed.current;
    const posAttr = pointsRef.current.geometry.attributes.position;

    for (let i = 0; i < count; i++) {
      // Projectile motion: x = vx*t, y = vy*t - 0.5*g*t², z = vz*t
      posAttr.array[i * 3] = position[0] + velocities[i * 3] * t;
      posAttr.array[i * 3 + 1] = position[1] + velocities[i * 3 + 1] * t - 2 * t * t;
      posAttr.array[i * 3 + 2] = position[2] + velocities[i * 3 + 2] * t;
    }
    posAttr.needsUpdate = true;

    // Fade out the material
    const mat = pointsRef.current.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, 1 - t / duration);

    if (t >= duration) {
      onComplete?.();
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={size}
        transparent
        opacity={1}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/** Confetti — colored rectangles falling with gravity. */
export function Confetti({
  position,
  duration = 2,
  count = 25,
  onComplete,
}: {
  position: [number, number, number];
  duration?: number;
  count?: number;
  onComplete?: () => void;
}) {
  const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#3498db', '#e67e22', '#9b59b6'];
  const pointsRef = useRef<THREE.Points>(null);

  const velocities = useMemo(() => {
    const v: number[] = [];
    for (let i = 0; i < count; i++) {
      v.push(
        (Math.random() - 0.5) * 3,
        1 + Math.random() * 2,
        (Math.random() - 0.5) * 3,
      );
    }
    return v;
  }, [count]);

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vertColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position[0] + (Math.random() - 0.5) * 2;
      positions[i * 3 + 1] = position[1] + Math.random() * 2;
      positions[i * 3 + 2] = position[2] + (Math.random() - 0.5) * 2;
      const c = colors[i % colors.length];
      const r = parseInt(c.slice(1, 3), 16) / 255;
      const g = parseInt(c.slice(3, 5), 16) / 255;
      const b = parseInt(c.slice(5, 7), 16) / 255;
      vertColors[i * 3] = r;
      vertColors[i * 3 + 1] = g;
      vertColors[i * 3 + 2] = b;
    }
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(vertColors, 3));
    return geo;
  }, [count, position]);

  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    elapsed.current += delta;
    const t = elapsed.current;
    const posAttr = pointsRef.current.geometry.attributes.position;

    for (let i = 0; i < count; i++) {
      posAttr.array[i * 3] += velocities[i * 3] * delta;
      posAttr.array[i * 3 + 1] += (velocities[i * 3 + 1] - 3 * t) * delta;
      posAttr.array[i * 3 + 2] += velocities[i * 3 + 2] * delta;
    }
    posAttr.needsUpdate = true;

    const mat = pointsRef.current.material as THREE.PointsMaterial;
    mat.opacity = Math.max(0, 1 - t / duration);

    if (t >= duration) onComplete?.();
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.1}
        vertexColors
        transparent
        opacity={1}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}
