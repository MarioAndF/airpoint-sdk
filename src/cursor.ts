export type AirpointCursorStyle = "arrow" | "circle" | "crosshair";
export type AirpointCursorClickAnimation = "none" | "pulse";

export type AirpointCursorPulseOptions = {
  color?: string;
  durationMs?: number;
  opacity?: number;
  scale?: number;
  size?: number;
};

export type AirpointCursorMoveOptions = {
  clicking?: boolean;
  grabbing?: boolean;
  hand?: "Left" | "Right" | string;
  rightClicking?: boolean;
  space?: "normalized" | "pixels";
};

export type AirpointCursorOverlayOptions = {
  className?: string;
  clickAnimation?: AirpointCursorClickAnimation;
  clickAnimationColor?: string;
  clickAnimationDurationMs?: number;
  clickAnimationScale?: number;
  color?: string;
  root?: HTMLElement;
  size?: number;
  style?: AirpointCursorStyle;
  zIndex?: number;
};

export type AirpointCursorOverlay = {
  destroy(): void;
  element: HTMLDivElement;
  hide(): void;
  move(x: number, y: number, options?: AirpointCursorMoveOptions): void;
  pulse(options?: AirpointCursorPulseOptions): void;
  setStyle(style: AirpointCursorStyle): void;
  show(): void;
};

const svgNamespace = "http://www.w3.org/2000/svg";

function createSvgElement<T extends keyof SVGElementTagNameMap>(
  tagName: T,
  attributes: Record<string, string>,
): SVGElementTagNameMap[T] {
  const element = document.createElementNS(svgNamespace, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function setBaseStyles(
  element: HTMLElement,
  options: Required<
    Pick<AirpointCursorOverlayOptions, "color" | "size" | "zIndex">
  >,
) {
  Object.assign(element.style, {
    color: options.color,
    height: `${options.size}px`,
    left: "0px",
    opacity: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0px",
    transform: "translate3d(-9999px, -9999px, 0)",
    transition: "opacity 120ms ease",
    width: `${options.size}px`,
    zIndex: String(options.zIndex),
  });
}

function setGlyphStyles(element: HTMLElement) {
  Object.assign(element.style, {
    height: "100%",
    left: "0px",
    position: "absolute",
    top: "0px",
    transform: "scale(1)",
    transition: "transform 90ms ease",
    width: "100%",
  });
}

function renderArrow(element: HTMLDivElement) {
  const svg = createSvgElement("svg", {
    "aria-hidden": "true",
    fill: "none",
    height: "100%",
    viewBox: "0 0 24 24",
    width: "100%",
  });
  const path = createSvgElement("path", {
    d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",
    fill: "currentColor",
    stroke: "#ffffff",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": "1.75",
  });
  svg.append(path);
  element.replaceChildren(svg);
}

function renderCircle(element: HTMLDivElement) {
  const svg = createSvgElement("svg", {
    "aria-hidden": "true",
    fill: "none",
    height: "100%",
    viewBox: "0 0 32 32",
    width: "100%",
  });
  const outer = createSvgElement("circle", {
    cx: "16",
    cy: "16",
    fill: "currentColor",
    r: "10",
    stroke: "#ffffff",
    "stroke-width": "2.5",
  });
  svg.append(outer);
  element.replaceChildren(svg);
}

function renderCrosshair(element: HTMLDivElement) {
  const svg = createSvgElement("svg", {
    "aria-hidden": "true",
    fill: "none",
    height: "100%",
    viewBox: "0 0 32 32",
    width: "100%",
  });
  const paths = ["M16 3v8", "M16 21v8", "M3 16h8", "M21 16h8"].map((d) =>
    createSvgElement("path", {
      d,
      stroke: "currentColor",
      "stroke-linecap": "round",
      "stroke-width": "2.5",
    }),
  );
  const center = createSvgElement("circle", {
    cx: "16",
    cy: "16",
    fill: "currentColor",
    r: "2.25",
  });
  svg.append(...paths, center);
  element.replaceChildren(svg);
}

function renderCursor(element: HTMLDivElement, style: AirpointCursorStyle) {
  if (style === "circle") {
    renderCircle(element);
    return;
  }
  if (style === "crosshair") {
    renderCrosshair(element);
    return;
  }
  renderArrow(element);
}

function toPixelCoordinate(
  value: number,
  axis: "x" | "y",
  space: "normalized" | "pixels",
) {
  if (space === "pixels") {
    return value;
  }
  return value * (axis === "x" ? window.innerWidth : window.innerHeight);
}

function getHotspotOffset(style: AirpointCursorStyle, size: number) {
  if (style === "arrow") {
    return {
      x: size * (4 / 24),
      y: size * (4 / 24),
    };
  }
  return {
    x: size / 2,
    y: size / 2,
  };
}

function createPulseElement(
  root: HTMLElement,
  point: { x: number; y: number },
  baseOptions: Required<
    Pick<AirpointCursorOverlayOptions, "color" | "size" | "zIndex">
  >,
  animationOptions: {
    color?: string;
    durationMs: number;
    scale: number;
  },
  pulseOptions: AirpointCursorPulseOptions = {},
  onRemove?: (pulse: HTMLSpanElement) => void,
) {
  const color =
    pulseOptions.color ?? animationOptions.color ?? baseOptions.color;
  const durationMs = Math.max(
    0,
    pulseOptions.durationMs ?? animationOptions.durationMs,
  );
  const opacity = pulseOptions.opacity ?? 0.32;
  const pulseScale = pulseOptions.scale ?? animationOptions.scale;
  const size = pulseOptions.size ?? baseOptions.size * 1.25;
  const pulse = document.createElement("span");
  pulse.dataset.airpointCursorPulse = "true";
  Object.assign(pulse.style, {
    border: `2px solid ${color}`,
    borderRadius: "9999px",
    boxSizing: "border-box",
    height: `${size}px`,
    left: `${point.x}px`,
    opacity: String(opacity),
    pointerEvents: "none",
    position: "fixed",
    top: `${point.y}px`,
    transform: "translate(-50%, -50%) scale(1)",
    transformOrigin: "center",
    transition: `transform ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${durationMs}ms ease-out`,
    width: `${size}px`,
    zIndex: String(baseOptions.zIndex - 1),
  });
  root.append(pulse);

  const win = root.ownerDocument.defaultView ?? window;
  win.setTimeout(() => {
    pulse.style.opacity = "0";
    pulse.style.transform = `translate(-50%, -50%) scale(${pulseScale})`;
  }, 0);
  win.setTimeout(() => {
    pulse.remove();
    onRemove?.(pulse);
  }, durationMs + 60);

  return pulse;
}

export function createAirpointCursorOverlay(
  options: AirpointCursorOverlayOptions = {},
): AirpointCursorOverlay {
  const root = options.root ?? document.body;
  const element = document.createElement("div");
  const glyph = document.createElement("div");
  const baseOptions = {
    color: options.color ?? "#111111",
    size: options.size ?? 28,
    zIndex: options.zIndex ?? 2147483647,
  };
  const animation = options.clickAnimation ?? "pulse";
  const animationOptions = {
    color: options.clickAnimationColor,
    durationMs: options.clickAnimationDurationMs ?? 380,
    scale: options.clickAnimationScale ?? 1.9,
  };
  let currentStyle = options.style ?? "arrow";
  let clickWasActive = false;
  let lastHotspotPoint: { x: number; y: number } | null = null;
  const pulses = new Set<HTMLSpanElement>();

  const addPulse = (
    point: { x: number; y: number },
    pulseOptions?: AirpointCursorPulseOptions,
  ) => {
    const pulse = createPulseElement(
      root,
      point,
      baseOptions,
      animationOptions,
      pulseOptions,
      (removedPulse) => pulses.delete(removedPulse),
    );
    pulses.add(pulse);
  };

  element.className = options.className ?? "airpoint-cursor";
  element.setAttribute("aria-hidden", "true");
  setBaseStyles(element, baseOptions);
  setGlyphStyles(glyph);
  element.style.filter = "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))";
  renderCursor(glyph, currentStyle);
  element.append(glyph);
  root.append(element);

  return {
    destroy() {
      for (const pulse of pulses) {
        pulse.remove();
      }
      pulses.clear();
      element.remove();
    },
    element,
    hide() {
      element.style.opacity = "0";
    },
    move(x, y, moveOptions = {}) {
      const space = moveOptions.space ?? "normalized";
      const pixelX = toPixelCoordinate(x, "x", space);
      const pixelY = toPixelCoordinate(y, "y", space);
      const hotspot = getHotspotOffset(currentStyle, baseOptions.size);
      lastHotspotPoint = { x: pixelX, y: pixelY };
      const scale = moveOptions.grabbing
        ? 1.1
        : moveOptions.clicking || moveOptions.rightClicking
          ? 0.9
          : 1;
      const clickActive = Boolean(
        moveOptions.clicking || moveOptions.rightClicking,
      );
      element.dataset.hand = moveOptions.hand ?? "";
      element.dataset.state = moveOptions.grabbing
        ? "grabbing"
        : moveOptions.rightClicking
          ? "right-clicking"
          : moveOptions.clicking
            ? "clicking"
            : "idle";
      element.style.opacity = "1";
      glyph.style.transformOrigin = `${hotspot.x}px ${hotspot.y}px`;
      glyph.style.transform = `scale(${scale})`;
      element.style.transform = `translate3d(${pixelX - hotspot.x}px, ${pixelY - hotspot.y}px, 0)`;
      if (animation !== "none" && clickActive && !clickWasActive) {
        addPulse(lastHotspotPoint);
      }
      clickWasActive = clickActive;
    },
    pulse(pulseOptions = {}) {
      const hotspot = getHotspotOffset(currentStyle, baseOptions.size);
      const rect = element.getBoundingClientRect();
      const point = lastHotspotPoint ?? {
        x: rect.left + hotspot.x,
        y: rect.top + hotspot.y,
      };
      addPulse(point, pulseOptions);
    },
    setStyle(style) {
      if (style === currentStyle) {
        return;
      }
      currentStyle = style;
      renderCursor(glyph, currentStyle);
    },
    show() {
      element.style.opacity = "1";
    },
  };
}
