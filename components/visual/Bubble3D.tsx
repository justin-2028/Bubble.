"use client";
import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, MeshTransmissionMaterial, useTexture } from '@react-three/drei';
import * as THREE from 'three';

type Props = {
  imageUrl?: string;
  gradientColors?: string[]; // fallback background if no image
};

function BackgroundTexture({ imageUrl, gradientColors }: Props) {
  // Build a dataURL gradient if no image is provided
  const colors = gradientColors && gradientColors.length >= 3
    ? gradientColors
    : ['#ffffff', '#f5f5f5', '#eeeeee'];
  const gradURL = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(80, 60, 10, 120, 120, 220);
    grd.addColorStop(0, colors[0]);
    grd.addColorStop(0.5, colors[1]);
    grd.addColorStop(1, colors[2]);
    g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL();
  }, [JSON.stringify(gradientColors)]);

  // Always pass a defined URL to the loader: prefer imageUrl, otherwise gradient
  const url = imageUrl || gradURL;
  const tex = useTexture(url);
  // Normalize texture settings for crisp sampling
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex as any;
}

function BubbleInner({ imageUrl, gradientColors }: Props) {
  const backgroundTex = BackgroundTexture({ imageUrl, gradientColors }) as unknown as THREE.Texture;
  // Procedural thickness map to drive outer iridescence (soap-like color banding)
  const thicknessTex = React.useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d')!;
    // Coherent noise using simple multi-octave value noise
    const noise = (x: number, y: number) => {
      let v = 0, a = 1, f = 1;
      for (let o = 0; o < 4; o++) {
        const nx = Math.sin((x * f) + o * 12.9898) * 43758.5453;
        const ny = Math.sin((y * f) + o * 78.233) * 43758.5453;
        const s = (nx - Math.floor(nx)) * (ny - Math.floor(ny));
        v += s * a; a *= 0.5; f *= 2.0;
      }
      return v;
    };
    const img = g.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        // Map to spherical coordinates to vary thickness more near edges
        const u = (x / c.width) * 2 - 1;
        const v = (y / c.height) * 2 - 1;
        const r = Math.sqrt(u*u + v*v);
        const n = noise(x / 32, y / 32) * 0.6 + (Math.max(0, 1 - r) * 0.4);
        const t = Math.max(0, Math.min(1, n));
        const idx = (y * c.width + x) * 4;
        const val = Math.floor(t * 255);
        img.data[idx] = val; img.data[idx+1] = val; img.data[idx+2] = val; img.data[idx+3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);

  return (
    <group>
      {/* Inner: screen-space transmission/refraction using provided background texture */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.9, 96, 96]} />
        <MeshTransmissionMaterial
          ior={1.34}
          thickness={0.35}
          chromaticAberration={0.06}
          anisotropy={0.03}
          distortion={0.08}
          distortionScale={0.18}
          temporalDistortion={0.05}
          roughness={0.06}
          transmission={1}
          samples={24}
          resolution={320}
          background={backgroundTex}
        />
      </mesh>
      {/* Outer: thin‑film iridescence shell */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.905, 96, 96]} />
        {/* @ts-ignore three supports iridescence props on meshPhysicalMaterial */}
        <meshPhysicalMaterial
          transparent
          opacity={0.7}
          color={new THREE.Color(0xffffff)}
          roughness={0.05}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.04}
          transmission={0}
          ior={1.34}
          iridescence={1}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[120, 900]}
          iridescenceThicknessMap={thicknessTex as any}
        />
      </mesh>
      <Environment preset="city" />
    </group>
  );
}

export function Bubble3D({ imageUrl, gradientColors }: Props) {
  return (
    <div className="absolute inset-0">
      <Canvas dpr={[1, 1.8]} camera={{ position: [0, 0, 2.2], fov: 45 }}>
        <Suspense fallback={null}>
          <BubbleInner imageUrl={imageUrl} gradientColors={gradientColors} />
        </Suspense>
      </Canvas>
    </div>
  );
}
