export type AirpointSvgIconName = "pointer" | "pointer-off";

export type AirpointSvgIconNode = readonly [
  tagName: "path" | "circle",
  attributes: Readonly<Record<string, string>>,
];

export type AirpointSvgIconDefinition = {
  name: AirpointSvgIconName;
  nodes: readonly AirpointSvgIconNode[];
  viewBox: string;
};

export type AirpointSvgIconOptions = {
  className?: string;
  color?: string;
  size?: number | string;
  strokeWidth?: number | string;
  title?: string;
};

const svgNamespace = "http://www.w3.org/2000/svg";

export const AIRPOINT_SVG_ICONS = {
  pointer: {
    name: "pointer",
    viewBox: "0 0 24 24",
    nodes: [
      ["path", { d: "M22 14a8 8 0 0 1-8 8" }],
      ["path", { d: "M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" }],
      ["path", { d: "M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" }],
      ["path", { d: "M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" }],
      [
        "path",
        {
          d: "M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
        },
      ],
    ],
  },
  "pointer-off": {
    name: "pointer-off",
    viewBox: "0 0 24 24",
    nodes: [
      ["path", { d: "M10 4.5V4a2 2 0 0 0-2.41-1.957" }],
      ["path", { d: "M13.9 8.4a2 2 0 0 0-1.26-1.295" }],
      [
        "path",
        {
          d: "M21.7 16.2A8 8 0 0 0 22 14v-3a2 2 0 1 0-4 0v-1a2 2 0 0 0-3.63-1.158",
        },
      ],
      [
        "path",
        {
          d: "m7 15-1.8-1.8a2 2 0 0 0-2.79 2.86L6 19.7a7.74 7.74 0 0 0 6 2.3h2a8 8 0 0 0 5.657-2.343",
        },
      ],
      ["path", { d: "M6 6v8" }],
      ["path", { d: "m2 2 20 20" }],
    ],
  },
} as const satisfies Record<AirpointSvgIconName, AirpointSvgIconDefinition>;

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function appendAttributes(
  element: SVGElement,
  attributes: Readonly<Record<string, string>>,
) {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

function normalizeSize(size: number | string | undefined) {
  return size === undefined ? "24" : String(size);
}

export function getAirpointSvgIconMarkup(
  name: AirpointSvgIconName,
  options: AirpointSvgIconOptions = {},
) {
  const icon = AIRPOINT_SVG_ICONS[name];
  const size = normalizeSize(options.size);
  const strokeWidth = String(options.strokeWidth ?? 2);
  const title = options.title
    ? `<title>${escapeAttribute(options.title)}</title>`
    : "";
  const className = options.className
    ? ` class="${escapeAttribute(options.className)}"`
    : "";
  const children = icon.nodes
    .map(([tagName, attributes]) => {
      const attrs = Object.entries(attributes)
        .map(
          ([attrName, attrValue]) =>
            `${attrName}="${escapeAttribute(attrValue)}"`,
        )
        .join(" ");
      return `<${tagName}${attrs ? ` ${attrs}` : ""}/>`;
    })
    .join("");

  return `<svg xmlns="${svgNamespace}"${className} width="${escapeAttribute(size)}" height="${escapeAttribute(size)}" viewBox="${icon.viewBox}" fill="none" stroke="${escapeAttribute(options.color ?? "currentColor")}" stroke-width="${escapeAttribute(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${options.title ? "false" : "true"}">${title}${children}</svg>`;
}

export function createAirpointSvgIconElement(
  name: AirpointSvgIconName,
  options: AirpointSvgIconOptions = {},
) {
  const icon = AIRPOINT_SVG_ICONS[name];
  const size = normalizeSize(options.size);
  const svg = document.createElementNS(svgNamespace, "svg");

  appendAttributes(svg, {
    "aria-hidden": options.title ? "false" : "true",
    fill: "none",
    height: size,
    stroke: options.color ?? "currentColor",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": String(options.strokeWidth ?? 2),
    viewBox: icon.viewBox,
    width: size,
  });

  if (options.className) {
    svg.setAttribute("class", options.className);
  }

  if (options.title) {
    const title = document.createElementNS(svgNamespace, "title");
    title.textContent = options.title;
    svg.append(title);
  }

  for (const [tagName, attributes] of icon.nodes) {
    const child = document.createElementNS(svgNamespace, tagName);
    appendAttributes(child, attributes);
    svg.append(child);
  }

  return svg;
}
