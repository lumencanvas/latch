<script setup lang="ts">
import { ref, onMounted } from 'vue'

const isVisible = ref(true)
const isFading = ref(false)

onMounted(() => {
  // Start fade after 2.5 seconds (animation completes around 1.6s)
  setTimeout(() => {
    isFading.value = true
    // Remove from DOM after fade animation
    setTimeout(() => {
      isVisible.value = false
    }, 500)
  }, 2500)
})
</script>

<template>
  <div
    v-if="isVisible"
    class="loading-screen"
    :class="{ fading: isFading }"
  >
    <div class="loading-content">
      <!-- Animated Logo -->
      <div class="logo-container">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 200"
          width="150"
          height="150"
        >
          <!-- Left bracket -->
          <path
            class="left-bracket"
            d="M 50 35 L 25 35 Q 15 35 15 45 L 15 155 Q 15 165 25 165 L 50 165"
            fill="none"
            stroke="#2a2a2a"
            stroke-width="12"
            stroke-linecap="round"
          />

          <!-- Right bracket -->
          <path
            class="right-bracket"
            d="M 150 35 L 175 35 Q 185 35 185 45 L 185 155 Q 185 165 175 165 L 150 165"
            fill="none"
            stroke="#2a2a2a"
            stroke-width="12"
            stroke-linecap="round"
          />

          <!-- Horizontal flow lines -->
          <line
            class="flow-line-1"
            x1="50"
            y1="75"
            x2="150"
            y2="75"
            stroke="#2a2a2a"
            stroke-width="4"
          />
          <line
            class="flow-line-2"
            x1="50"
            y1="125"
            x2="150"
            y2="125"
            stroke="#2a2a2a"
            stroke-width="4"
          />

          <!-- Diagonal latch bar - pivots from right catch point -->
          <line
            class="latch-bar"
            x1="65"
            y1="115"
            x2="135"
            y2="85"
            stroke="#2a2a2a"
            stroke-width="8"
            stroke-linecap="round"
          />

          <!-- Orange accent at pivot/hinge point -->
          <rect
            class="pivot-point"
            x="58"
            y="108"
            width="18"
            height="14"
            rx="3"
            fill="#e85d3b"
          />

          <!-- Catch point on right -->
          <rect
            class="catch-point"
            x="130"
            y="80"
            width="14"
            height="10"
            rx="2"
            fill="#e85d3b"
          />
        </svg>
      </div>

      <!-- Brand text -->
      <div class="brand-text">
        <span class="brand-name">LATCH</span>
        <span class="brand-tagline">Live Art Tool for Creative Humans</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f2eb;
  z-index: 9999;
  transition: opacity 0.5s ease;
}

.loading-screen.fading {
  opacity: 0;
  pointer-events: none;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.logo-container {
  width: 150px;
  height: 150px;
}

/* Bracket drawing animation */
.left-bracket {
  stroke-dasharray: 350;
  stroke-dashoffset: 350;
  animation: bracketDraw 0.8s ease-out forwards;
}

.right-bracket {
  stroke-dasharray: 350;
  stroke-dashoffset: 350;
  animation: bracketDraw 0.8s ease-out 0.15s forwards;
}

@keyframes bracketDraw {
  0% {
    stroke-dashoffset: 350;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

/* Flow line animation */
.flow-line-1 {
  stroke-dasharray: 150;
  stroke-dashoffset: 150;
  animation: lineDraw 0.5s ease-out 0.5s forwards;
}

.flow-line-2 {
  stroke-dasharray: 150;
  stroke-dashoffset: 150;
  animation: lineDraw 0.5s ease-out 0.65s forwards;
}

@keyframes lineDraw {
  0% {
    stroke-dashoffset: 150;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

/* Latch bar drop animation */
.latch-bar {
  transform-origin: 135px 85px;
  transform: rotate(30deg);
  opacity: 0;
  animation: latchDrop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.9s forwards;
}

@keyframes latchDrop {
  0% {
    transform: rotate(30deg);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  70% {
    transform: rotate(-3deg);
  }
  85% {
    transform: rotate(1deg);
  }
  100% {
    transform: rotate(0deg);
    opacity: 1;
  }
}

/* Pivot point animation */
.pivot-point {
  opacity: 0;
  transform-origin: center;
  animation: catchAppear 0.4s ease-out 1.3s forwards;
}

@keyframes catchAppear {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  80% {
    transform: scale(1.15);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Catch point pulse animation */
.catch-point {
  animation: pivotPulse 2s ease-in-out 1.6s infinite;
}

@keyframes pivotPulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Brand text */
.brand-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.brand-name {
  font-family: system-ui, -apple-system, Helvetica, Arial, sans-serif;
  font-size: 48px;
  font-weight: 400;
  letter-spacing: 0.3em;
  color: #2a2a2a;
  text-transform: uppercase;
  opacity: 0;
  animation: brandFadeIn 0.8s ease-out 1.4s forwards;
}

.brand-tagline {
  font-family: system-ui, -apple-system, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.15em;
  color: #2a2a2a;
  text-transform: uppercase;
  opacity: 0;
  animation: brandFadeIn 0.8s ease-out 1.6s forwards;
}

@keyframes brandFadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
