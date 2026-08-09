/**
 * Particle effect components — lightweight one-shot visual bursts (PLAN-PHASE-4 §4).
 *
 * Each effect self-removes via its onComplete. The EffectManager spawns these
 * on bus events. All are Director-layer; no Oracle state.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, Mesh, BoxGeometry, MeshStandardMaterial, Group } from 'three';

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

  const velocities = useMemo(() => {
    const v: number[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const r = speed * (0.5 + Math.random() * 0.5);
      v.push(Math.cos(angle) * r, 0.5 + Math.random() * speed, Math.sin(angle) * r);
    }
    return v;
  }, [count, speed]);

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
      posAttr.array[i * 3] = position[0] + velocities[i * 3] * t;
      posAttr.array[i * 3 + 1] = position[1] + velocities[i * 3 + 1] * t - 2 * t * t;
      posAttr.array[i * 3 + 2] = position[2] + velocities[i * 3 + 2] * t;
    }
    posAttr.needsUpdate = true;

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

/**
 * Confetti — individual colored box pieces that launch upward, fall with gravity,
 * rotate, and fade. Much more visible than the old points-based version.
 */
export function Confetti({
  position,
  count = 25,
  duration = 2.5,
  onComplete,
}: {
  position: [number, number, number];
  count?: number;
  duration?: number;
  onComplete?: () => void;
}) {
  const groupRef = useRef<Group>(null);
  const elapsed = useRef(0);
  const done = useRef(false);

  // Pre-compute particle data: position, velocity, rotation speed, color
  const particles = useMemo(() => {
    const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#3498db', '#e67e22', '#9b59b6'];
    return Array.from({ length: count }, (_, i) => ({
      ox: position[0] + (Math.random() - 0.5) * 1.5,
      oy: position[1] + Math.random() * 0.5,
      oz: position[2] + (Math.random() - 0.5) * 1.5,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      vz: (Math.random() - 0.5) * 3,
      rx: Math.random() * 0.2 + 0.05,
      ry: Math.random() * 0.2 + 0.05,
      color: colors[i % colors.length],
    }));
  }, [count, position]);

  // Pre-create meshes
  const meshes = useMemo(() => {
    return particles.map((p) => {
      const mesh = new Mesh(
        new BoxGeometry(0.08, 0.14, 0.02),
        new MeshStandardMaterial({
          color: p.color,
          transparent: true,
          opacity: 1,
          roughness: 0.4,
          metalness: 0.1,
        }),
      );
      mesh.position.set(p.ox, p.oy, p.oz);
      return mesh;
    });
  }, [particles]);

  // Mount meshes into the group on mount, unmount on cleanup
  useEffect(() => {
    if (!groupRef.current) return;
    meshes.forEach((m) => groupRef.current!.add(m));
    return () => {
      meshes.forEach((m) => {
        groupRef.current?.remove(m);
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      });
    };
  }, [meshes]);

  useFrame((_, delta) => {
    if (!groupRef.current || done.current) return;
    elapsed.current += delta;
    const t = elapsed.current;
    const progress = t / duration;

    if (progress >= 1) {
      done.current = true;
      // Dispose + remove
      meshes.forEach((m) => {
        groupRef.current!.remove(m);
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      });
      onComplete?.();
      return;
    }

    // Physics: apply gravity to vy, update positions, rotate
    meshes.forEach((m, i) => {
      const p = particles[i];
      p.vy -= 6 * delta; // gravity
      m.position.x = p.ox + p.vx * t;
      m.position.y = p.oy + p.vy * t + 0.5 * (-6) * t * t; // projectile
      m.position.z = p.oz + p.vz * t;
      m.rotation.x += p.rx;
      m.rotation.y += p.ry;

      // Fade out in the last 40%
      const mat = m.material as MeshStandardMaterial;
      if (progress > 0.6) {
        mat.opacity = Math.max(0, 1 - (progress - 0.6) / 0.4);
      }
    });
  });

  return <group ref={groupRef} />;
}
