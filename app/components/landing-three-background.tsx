'use client';

import Image from 'next/image';
import { ColorBends } from './color-bends';

export function LandingThreeBackground() {
  return (
    <div className="landing-three-bg" aria-hidden="true">
      <div className="landing-three-bg-image">
        <Image
          src="/coming-soon/bcg-fast.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="landing-three-bg-img"
        />
      </div>
      <div className="landing-three-bg-shader">
        <ColorBends
          rotation={45}
          speed={0.45}
          colors={['#2B2C2F', '#C8CFD8', '#5F6672']}
          transparent
          autoRotate={0.25}
          scale={1.3}
          frequency={1.1}
          warpStrength={0.9}
          mouseInfluence={0.6}
          parallax={0.6}
          noise={0}
        />
      </div>
    </div>
  );
}
