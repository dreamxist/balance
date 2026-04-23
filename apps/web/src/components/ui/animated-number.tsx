import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring, animate } from 'motion/react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'

interface AnimatedNumberProps {
  value: number
  format?: (n: number) => string
  className?: string
  duration?: number
}

export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.3,
}: AnimatedNumberProps) {
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { duration: duration * 1000, bounce: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      if (ref.current) {
        const rounded = Math.round(latest)
        ref.current.textContent = format ? format(rounded) : formatMoney(rounded)
      }
    })
    return unsubscribe
  }, [spring, format])

  useEffect(() => {
    animate(motionValue, value, { duration })
  }, [motionValue, value, duration])

  return (
    <span
      ref={ref}
      className={cn('font-mono tabular-nums', className)}
    />
  )
}
