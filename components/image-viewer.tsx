"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { RotateCw, ChevronLeft, ChevronRight, X, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"

interface ImageViewerProps {
  images: File[]
  onClose?: () => void
  onHide?: () => void
  initialIndex?: number
}

export function ImageViewer({ images, onClose, onHide, initialIndex = 0 }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(50)
  const [rotation, setRotation] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const previousRotationRef = useRef<number>(0)
  const shouldPreserveScrollRef = useRef<boolean>(false)

  // Create object URLs for all images
  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file))
    setImageUrls(urls)

    // Cleanup function
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [images])

  // Reset zoom and rotation when changing image
  useEffect(() => {
    setZoom(50)
    setRotation(0)
    setImageSize(null) // Reset image size when changing images
    previousRotationRef.current = 0
    shouldPreserveScrollRef.current = false
  }, [currentIndex])

  // Center image on initial load, preserve scroll position during rotation
  useEffect(() => {
    if (scrollRef.current && imageSize && imageRef.current) {
      const container = scrollRef.current
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      
      // Check if this is a rotation change (not initial load or zoom change)
      const isRotationChange = previousRotationRef.current !== rotation && shouldPreserveScrollRef.current
      
      if (isRotationChange) {
        // Preserve scroll position during rotation
        const prevRotation = previousRotationRef.current
        const rotationDelta = ((rotation - prevRotation) % 360 + 360) % 360 // Normalize to 0-360
        
        // Get current scroll position
        const currentScrollX = container.scrollLeft
        const currentScrollY = container.scrollTop
        
        // Calculate what point in the image (in image pixel coordinates) is at viewport center
        const viewportCenterX = currentScrollX + containerWidth / 2
        const viewportCenterY = currentScrollY + containerHeight / 2
        
        // Calculate image dimensions before rotation (accounting for previous rotation)
        const isPrev90or270 = (prevRotation % 180) === 90
        const prevScaledWidth = isPrev90or270 
          ? imageSize.height * (zoom / 100) 
          : imageSize.width * (zoom / 100)
        const prevScaledHeight = isPrev90or270 
          ? imageSize.width * (zoom / 100) 
          : imageSize.height * (zoom / 100)
        
        // Find the point in image coordinates (0 to 1) that's at viewport center
        // The image is centered in the scroll container, so we need to account for that
        const imageCenterX = prevScaledWidth / 2
        const imageCenterY = prevScaledHeight / 2
        
        // Calculate offset from image center in scroll coordinates
        const offsetX = viewportCenterX - imageCenterX
        const offsetY = viewportCenterY - imageCenterY
        
        // Convert to normalized coordinates (-1 to 1) relative to image center
        const normalizedX = prevScaledWidth > 0 ? offsetX / (prevScaledWidth / 2) : 0
        const normalizedY = prevScaledHeight > 0 ? offsetY / (prevScaledHeight / 2) : 0
        
        // Apply rotation transformation to normalized coordinates
        // Rotation is around the center, so we rotate the offset vector
        let newNormalizedX = normalizedX
        let newNormalizedY = normalizedY
        
        if (rotationDelta === 90) {
          // Rotate 90° clockwise: (x, y) -> (-y, x)
          [newNormalizedX, newNormalizedY] = [-normalizedY, normalizedX]
        } else if (rotationDelta === 180) {
          // Rotate 180°: (x, y) -> (-x, -y)
          [newNormalizedX, newNormalizedY] = [-normalizedX, -normalizedY]
        } else if (rotationDelta === 270) {
          // Rotate 270° clockwise: (x, y) -> (y, -x)
          [newNormalizedX, newNormalizedY] = [normalizedY, -normalizedX]
        }
        
        // Calculate image dimensions after rotation
        const is90or270 = (rotation % 180) === 90
        const newScaledWidth = is90or270 
          ? imageSize.height * (zoom / 100) 
          : imageSize.width * (zoom / 100)
        const newScaledHeight = is90or270 
          ? imageSize.width * (zoom / 100) 
          : imageSize.height * (zoom / 100)
        
        // Convert back to scroll coordinates
        const newImageCenterX = newScaledWidth / 2
        const newImageCenterY = newScaledHeight / 2
        const newOffsetX = newNormalizedX * (newScaledWidth / 2)
        const newOffsetY = newNormalizedY * (newScaledHeight / 2)
        
        // Calculate new viewport center position
        const newViewportCenterX = newImageCenterX + newOffsetX
        const newViewportCenterY = newImageCenterY + newOffsetY
        
        // Calculate new scroll position
        const newScrollX = Math.max(0, Math.min(newViewportCenterX - containerWidth / 2, Math.max(0, newScaledWidth - containerWidth)))
        const newScrollY = Math.max(0, Math.min(newViewportCenterY - containerHeight / 2, Math.max(0, newScaledHeight - containerHeight)))
        
        // Apply new scroll position after DOM update
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollLeft = newScrollX
              scrollRef.current.scrollTop = newScrollY
            }
          })
        })
        
        previousRotationRef.current = rotation
      } else {
        // Initial load or zoom change - center the image
        const is90or270 = (rotation % 180) === 90
        const scaledWidth = is90or270 ? imageSize.height * (zoom / 100) : imageSize.width * (zoom / 100)
        const scaledHeight = is90or270 ? imageSize.width * (zoom / 100) : imageSize.height * (zoom / 100)
        
        const scrollX = Math.max(0, (scaledWidth - containerWidth) / 2)
        const scrollY = Math.max(0, (scaledHeight - containerHeight) / 2)
        
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollX
            scrollRef.current.scrollTop = scrollY
          }
        })
        
        previousRotationRef.current = rotation
        shouldPreserveScrollRef.current = true // Enable scroll preservation for future rotations
      }
    }
  }, [zoom, rotation, imageSize])

  const currentImage = images[currentIndex]
  const currentImageUrl = imageUrls[currentIndex]

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const handleZoomChange = (value: number[]) => {
    setZoom(value[0])
  }

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360)
  }

  // Calculate container dimensions based on image size, zoom, and rotation
  const containerDimensions = useMemo(() => {
    if (!imageSize) {
      return { width: "100%", height: "100%" }
    }
    
    const is90or270 = (rotation % 180) === 90
    const scaledWidth = is90or270 
      ? imageSize.height * (zoom / 100) 
      : imageSize.width * (zoom / 100)
    const scaledHeight = is90or270 
      ? imageSize.width * (zoom / 100) 
      : imageSize.height * (zoom / 100)
    
    // Add padding (1rem = 16px on each side = 32px total)
    return {
      width: Math.max(scaledWidth + 32, "100%"),
      height: Math.max(scaledHeight + 32, "100%"),
    }
  }, [imageSize, zoom, rotation])

  if (images.length === 0) {
    return null
  }

  return (
    <Card className="flex flex-col h-full p-0">
      {/* Header with controls */}
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium truncate">
            {currentImage?.name || `Imagen ${currentIndex + 1}`}
          </span>
          <span className="text-xs text-muted-foreground">
            ({currentIndex + 1} / {images.length})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Navigation */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={currentIndex === images.length - 1}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Zoom controls with slider */}
          <div className="flex items-center gap-2 min-w-[120px] max-w-[200px]">
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
              {zoom}%
            </span>
            <Slider
              value={[zoom]}
              onValueChange={handleZoomChange}
              min={50}
              max={300}
              step={5}
              className="flex-1"
            />
          </div>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Rotation */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            className="h-8 w-8 p-0"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          {/* Hide button (if onHide provided) */}
          {onHide && (
            <>
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onHide}
                className="h-8 w-8 p-0"
                title="Ocultar documento"
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Close button (if onClose provided) */}
          {onClose && (
            <>
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Image thumbnails bar */}
      {images.length > 1 && (
        <div className="border-b bg-muted/20 p-2 overflow-x-auto">
          <div className="flex gap-2 justify-center">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`
                  relative flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-all
                  ${
                    index === currentIndex
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50"
                  }
                `}
              >
                {imageUrls[index] && (
                  <img
                    src={imageUrls[index]}
                    alt={`Thumbnail ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}
                {index === currentIndex && (
                  <div className="absolute inset-0 bg-primary/10" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image viewer */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-muted/10"
        style={{
          overscrollBehavior: "contain",
        }}
      >
        {currentImageUrl && (
          <div 
            style={{
              padding: "1rem",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: containerDimensions.width,
              height: containerDimensions.height,
              minHeight: "100%",
              minWidth: "100%",
            }}
          >
            <div
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease-in-out",
                display: "block",
                width: imageSize?.width || "auto",
                height: imageSize?.height || "auto",
              }}
              className="relative"
            >
              <img
                ref={imageRef}
                src={currentImageUrl}
                alt={currentImage?.name || `Imagen ${currentIndex + 1}`}
                className="shadow-lg rounded"
                style={{
                  display: "block",
                  height: "auto",
                  width: "auto",
                  maxWidth: "none",
                  objectFit: "contain",
                }}
                onLoad={(e) => {
                  const img = e.currentTarget
                  setImageSize({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  })
                  
                  // Center the image after it loads
                  // Use double requestAnimationFrame to ensure layout is complete
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      if (scrollRef.current) {
                        const container = scrollRef.current
                        const is90or270 = (rotation % 180) === 90
                        const scaledWidth = is90or270 
                          ? img.naturalHeight * (zoom / 100) 
                          : img.naturalWidth * (zoom / 100)
                        const scaledHeight = is90or270 
                          ? img.naturalWidth * (zoom / 100) 
                          : img.naturalHeight * (zoom / 100)
                        const containerWidth = container.clientWidth
                        const containerHeight = container.clientHeight
                        
                        // Calculate scroll position to center the scaled image
                        const scrollX = Math.max(0, (scaledWidth - containerWidth) / 2)
                        const scrollY = Math.max(0, (scaledHeight - containerHeight) / 2)
                        
                        container.scrollLeft = scrollX
                        container.scrollTop = scrollY
                      }
                    })
                  })
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
