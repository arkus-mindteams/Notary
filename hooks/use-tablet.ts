import * as React from 'react'

const TABLET_MIN_WIDTH = 768
const TABLET_MAX_WIDTH = 1024

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const checkTablet = () => {
      const width = window.innerWidth
      setIsTablet(width >= TABLET_MIN_WIDTH && width < TABLET_MAX_WIDTH)
    }

    const mql = window.matchMedia(`(min-width: ${TABLET_MIN_WIDTH}px) and (max-width: ${TABLET_MAX_WIDTH - 1}px)`)
    const onChange = () => {
      checkTablet()
    }
    
    mql.addEventListener('change', onChange)
    checkTablet()
    
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isTablet
}
