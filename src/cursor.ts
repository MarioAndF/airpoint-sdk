export type AirpointCursorStyle = "arrow" | "circle" | "crosshair";

export type AirpointCursorMoveOptions = {
  clicking?: boolean;
  grabbing?: boolean;
  hand?: "Left" | "Right" | string;
  rightClicking?: boolean;
  space?: "normalized" | "pixels";
};

export type AirpointCursorOverlayOptions = {
  className?: string;
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
    transition: "opacity 120ms ease, scale 90ms ease",
    width: `${options.size}px`,
    zIndex: String(options.zIndex),
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
  const inner = createSvgElement("circle", {
    cx: "16",
    cy: "16",
    fill: "#ffffff",
    r: "2",
  });
  svg.append(outer, inner);
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

export function createAirpointCursorOverlay(
  options: AirpointCursorOverlayOptions = {},
): AirpointCursorOverlay {
  const root = options.root ?? document.body;
  const element = document.createElement("div");
  const baseOptions = {
    color: options.color ?? "#111111",
    size: options.size ?? 28,
    zIndex: options.zIndex ?? 2147483647,
  };
  let currentStyle = options.style ?? "arrow";

  element.className = options.className ?? "airpoint-cursor";
  element.setAttribute("aria-hidden", "true");
  setBaseStyles(element, baseOptions);
  element.style.filter = "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))";
  renderCursor(element, currentStyle);
  root.append(element);

  return {
    destroy() {
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
      const scale = moveOptions.grabbing
        ? 1.1
        : moveOptions.clicking || moveOptions.rightClicking
          ? 0.9
          : 1;
      element.dataset.hand = moveOptions.hand ?? "";
      element.dataset.state = moveOptions.grabbing
        ? "grabbing"
        : moveOptions.rightClicking
          ? "right-clicking"
          : moveOptions.clicking
            ? "clicking"
            : "idle";
      element.style.opacity = "1";
      element.style.scale = String(scale);
      element.style.transform = `translate3d(${pixelX - hotspot.x}px, ${pixelY - hotspot.y}px, 0)`;
    },
    setStyle(style) {
      if (style === currentStyle) {
        return;
      }
      currentStyle = style;
      renderCursor(element, currentStyle);
    },
    show() {
      element.style.opacity = "1";
    },
  };
}
