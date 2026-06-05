Shorthand instructions.

spatial: wrap `<GlassCard>`
micro: centralise Framer controls via useAnimationControls() in shared/useUIReaction.js; expose triggerMicro(event,type) where type ∈ ['pulse','breathe','flip']; pipe transcription status → triggerMicro('copy','pulse'); pipe recorder state → triggerMicro('tabBar','breathe'); pipe download finish → triggerMicro('icon','flip'); variants predefined for each type with duration/ease constants.
buddy receives: drop hook, wrap card, wire triggers.


Enhancments

🔮 1. Spatial UI with Layered Depth
What: Glassmorphism is a start, but go full spatial UI—layered glass panels with parallax hover effects, z-index shifts, and subtle 3D tilt on cards.
How: Use CSS perspective, transform-style: preserve-3d, and Framer Motion’s useSpring to make UI elements react to mouse position.
Impact: Makes the UI feel alive, like a futuristic HUD.
🧠 2. Context-Aware Microinteractions
What: Every action should respond with intent.
Examples:
When a transcript is done, the copy button pulses once.
When audio is recording, the entire tab bar breathes in sync with the waveform.
When a download finishes, the icon flips and reveals a checkmark.
How: Use Framer Motion variants + useAnimationControls.
Impact: Feels like the app anticipates your next move.
