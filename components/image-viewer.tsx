"use client"

import { useState, useEffect, useRef } from "react"
import { RotateCw, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"

interface ImageViewerProps {
  images: File[]
  onClose?: () => void
  initialIndex?: number
}

export function ImageViewer({ images, onClose, initialIndex = 0 }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)

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
    setZoom(100)
    setRotation(0)
    setImageSize(null) // Reset image size when changing images
  }, [currentIndex])

  // Note: Removed automatic centering on zoom/rotation changes
  // Users can manually scroll to view different parts of the image

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

  if (images.length === 0) {
    return null
  }

  return (
    <Card className="flex flex-col h-full">
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
          // Ensure we can scroll to see all parts of the image
          overscrollBehavior: "contain",
        }}
      >
        {currentImageUrl && (
          <div 
            style={{
              // Use reasonable padding to ensure scrollability in all directions
              // Reduced padding to minimize excessive scrolling
              padding: imageSize 
                ? `${Math.max(50, Math.min(100, imageSize.width * (zoom / 100) * 0.1, imageSize.height * (zoom / 100) * 0.1))}px`
                : "1rem",
              boxSizing: "border-box",
              // Ensure container is large enough for scaled content
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              // Minimum size to accommodate scaled image with minimal extra space for scrolling
              minHeight: imageSize 
                ? `${imageSize.height * (zoom / 100) + 100}px`
                : "100%",
              minWidth: imageSize 
                ? `${imageSize.width * (zoom / 100) + 100}px`
                : "100%",
            }}
          >
            <div
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                transition: "transform 0.2s ease-in-out",
                // Use block to allow proper sizing
                display: "block",
                // Ensure the wrapper maintains the natural image size
                width: imageSize ? `${imageSize.width}px` : "fit-content",
                height: imageSize ? `${imageSize.height}px` : "fit-content",
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
                  // Don't constrain width - let it be natural size
                  maxWidth: "none",
                  // Ensure image maintains aspect ratio
                  objectFit: "contain",
                }}
                onLoad={(e) => {
                  const img = e.currentTarget
                  // Store image size for container calculations
                  setImageSize({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  })
                  
                  // Note: Removed automatic centering on image load
                  // Image will appear at the current scroll position
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
