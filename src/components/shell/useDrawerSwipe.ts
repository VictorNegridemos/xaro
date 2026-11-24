'use client'

import { useSwipeable, type SwipeEventData, type SwipeableHandlers } from 'react-swipeable'

export type SwipeStart = { x: number; y: number }

export interface DrawerSwipeOptions {
  /** false switches every callback off (e.g. the surface does not swipe in this layout). */
  enabled?: boolean
  onLeft?: (start: SwipeStart) => void
  onRight?: (start: SwipeStart) => void
  onUp?: (start: SwipeStart) => void
  onDown?: (start: SwipeStart) => void
}

/**
 * The one place where swipe gestures are configured (plan 7.4, react-swipeable 7 option names).
 * Tap always works; a swipe is an addition. The returned handlers are spread on ONE specific
 * surface (the bottom nav row, the ship bar, the content gutters, a drawer or its grab handle);
 * nothing is ever bound to `document`.
 *
 * Scrolling is never blocked from JavaScript (`preventScrollOnSwipe: false` keeps the listeners
 * passive): each surface declares the axis it leaves to the browser with CSS `touch-action`.
 */
export function useDrawerSwipe({ enabled = true, onLeft, onRight, onUp, onDown }: DrawerSwipeOptions): SwipeableHandlers {
  const wrap = (callback: ((start: SwipeStart) => void) | undefined) => (
    (data: SwipeEventData) => {
      if (enabled && callback) callback({ x: data.initial[0], y: data.initial[1] })
    }
  )
  return useSwipeable({
    onSwipedLeft: wrap(onLeft),
    onSwipedRight: wrap(onRight),
    onSwipedUp: wrap(onUp),
    onSwipedDown: wrap(onDown),
    delta: 40,
    swipeDuration: 400,
    preventScrollOnSwipe: false,
    trackTouch: true,
    trackMouse: false,
  })
}
