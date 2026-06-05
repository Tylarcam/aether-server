export default function GrainyMesh() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Mesh gradient background */}
      <div className="absolute inset-0 bg-mesh-gradient opacity-50" />

      {/* Grainy texture overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-30">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>

      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-40 h-40 bg-luna-accent-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-60 h-60 bg-luna-accent-glow/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
    </div>
  );
}
