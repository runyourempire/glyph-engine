import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

interface GlyphComponentProps {
  /** The tag name of the GAME component (e.g., "glyph-glowing-orb") */
  tag: string;
  /** Path to the compiled .js file */
  src: string;
  /** Uniform parameters */
  params?: Record<string, number>;
  /** CSS class name */
  className?: string;
  /** Inline style */
  style?: React.CSSProperties;
  /** Called when the component is ready */
  onReady?: (element: HTMLElement) => void;
}

export interface GlyphComponentRef {
  /** Set a uniform parameter */
  setParam(name: string, value: number): void;
  /** Capture current frame as ImageData */
  getFrame(): ImageData | null;
  /** Capture current frame as data URL */
  getFrameDataURL(type?: string): string | null;
  /** Get the underlying HTML element */
  element: HTMLElement | null;
}

export const GlyphComponent = forwardRef<GlyphComponentRef, GlyphComponentProps>(
  ({ tag, src, params, className, style, onReady }, forwardedRef) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const elementRef = useRef<any>(null);
    const scriptLoadedRef = useRef(false);

    // Load script
    useEffect(() => {
      if (scriptLoadedRef.current) return;
      const existing = document.querySelector(`script[data-glyph-src="${src}"]`);
      if (existing) {
        scriptLoadedRef.current = true;
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.glyphSrc = src;
      script.onload = () => {
        scriptLoadedRef.current = true;
      };
      script.onerror = () => {
        console.error(`[GAME] Failed to load component script: ${src}`);
      };
      document.head.appendChild(script);
    }, [src]);

    // Create element
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const el = document.createElement(tag);
      el.style.width = '100%';
      el.style.height = '100%';
      container.appendChild(el);
      elementRef.current = el;

      customElements.whenDefined(tag).then(() => {
        onReady?.(el);
      });

      return () => {
        container.removeChild(el);
        elementRef.current = null;
      };
    }, [tag]);

    // Apply params
    useEffect(() => {
      const el = elementRef.current;
      if (!el || !params) return;
      for (const [name, value] of Object.entries(params)) {
        if (el.setParam) el.setParam(name, value);
      }
    }, [params]);

    // Expose imperative handle
    useImperativeHandle(forwardedRef, () => ({
      setParam(name: string, value: number) {
        elementRef.current?.setParam(name, value);
      },
      getFrame() {
        return elementRef.current?.getFrame?.() ?? null;
      },
      getFrameDataURL(type?: string) {
        return elementRef.current?.getFrameDataURL?.(type) ?? null;
      },
      get element() {
        return elementRef.current;
      }
    }), []);

    return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', ...style }} />;
  }
);

GlyphComponent.displayName = 'GlyphComponent';
