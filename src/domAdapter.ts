import type { AirpointHostAdapter, AirpointIntentEvent } from "./plugin";

export type AirpointDomIntentAction =
  | "auto"
  | "blur"
  | "click"
  | "context_menu"
  | "dispatch_event"
  | "double_click"
  | "focus"
  | "none"
  | "scroll_into_view"
  | "submit"
  | "toggle";

export type AirpointDomAdapterRoot = Document | Element | ShadowRoot;
export type AirpointDomPointerTargetMode = "cursor" | "intent";

export type AirpointDomAdapterOptions = {
  actions?: Record<string, AirpointDomIntentAction>;
  defaultAction?: AirpointDomIntentAction;
  pointerTarget?: AirpointDomPointerTargetMode;
  root?: AirpointDomAdapterRoot;
  scrollBehavior?: ScrollBehavior;
  sendCustomEvents?: boolean;
};

type AirpointDomIntentMetadata = {
  action?: unknown;
  domAction?: unknown;
};

const DOM_ACTIONS = new Set<AirpointDomIntentAction>([
  "auto",
  "blur",
  "click",
  "context_menu",
  "dispatch_event",
  "double_click",
  "focus",
  "none",
  "scroll_into_view",
  "submit",
  "toggle",
]);

const POINTER_ACTIONS = new Set<AirpointDomIntentAction>([
  "click",
  "context_menu",
  "double_click",
  "toggle",
]);

function getRoot(
  options: AirpointDomAdapterOptions,
): AirpointDomAdapterRoot | null {
  if (options.root) {
    return options.root;
  }
  return typeof document === "undefined" ? null : document;
}

function getRootDocument(root: AirpointDomAdapterRoot | null): Document | null {
  if (root && "nodeType" in root && root.nodeType === 9) {
    return root as Document;
  }
  if (root && "ownerDocument" in root) {
    return root.ownerDocument;
  }
  return typeof document === "undefined" ? null : document;
}

function getDefaultView(root: AirpointDomAdapterRoot | null) {
  return getRootDocument(root)?.defaultView ?? null;
}

function getWindow(root: AirpointDomAdapterRoot | null) {
  return getDefaultView(root) ?? globalThis;
}

function isHtmlElement(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
): target is HTMLElement {
  const view = getDefaultView(root);
  return Boolean(
    target && view?.HTMLElement && target instanceof view.HTMLElement,
  );
}

function isSvgElement(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
): target is SVGElement {
  const view = getDefaultView(root);
  return Boolean(
    target && view?.SVGElement && target instanceof view.SVGElement,
  );
}

function isElement(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
): target is Element {
  const view = getDefaultView(root);
  return Boolean(target && view?.Element && target instanceof view.Element);
}

function isFormElement(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
): target is HTMLFormElement {
  const view = getDefaultView(root);
  return Boolean(
    target && view?.HTMLFormElement && target instanceof view.HTMLFormElement,
  );
}

function queryTarget(
  root: AirpointDomAdapterRoot | null,
  selector: string | undefined,
) {
  if (!root || !selector || typeof root.querySelector !== "function") {
    return null;
  }
  return root.querySelector(selector);
}

function containsTarget(root: AirpointDomAdapterRoot | null, target: Element) {
  if (!root || root === target) {
    return true;
  }
  if ("contains" in root && typeof root.contains === "function") {
    return root.contains(target);
  }
  return true;
}

function getElementAtPoint(
  root: AirpointDomAdapterRoot | null,
  point: AirpointIntentEvent["point"],
) {
  if (!point) {
    return null;
  }

  const rootElementFromPoint =
    root &&
    "elementFromPoint" in root &&
    typeof root.elementFromPoint === "function"
      ? root.elementFromPoint.bind(root)
      : null;
  const rootDocument = getRootDocument(root);
  const documentElementFromPoint =
    rootDocument?.elementFromPoint?.bind(rootDocument);
  const target =
    rootElementFromPoint?.(point.x, point.y) ??
    documentElementFromPoint?.(point.x, point.y) ??
    null;

  if (!target || !containsTarget(root, target)) {
    return null;
  }
  return target;
}

function getEventTarget(
  root: AirpointDomAdapterRoot | null,
  event: AirpointIntentEvent,
) {
  return (
    event.target ??
    getElementAtPoint(root, event.point) ??
    getRootDocument(root)
  );
}

function getActionTarget(
  root: AirpointDomAdapterRoot | null,
  event: AirpointIntentEvent,
  action: AirpointDomIntentAction,
  options: AirpointDomAdapterOptions,
) {
  if (POINTER_ACTIONS.has(action) && options.pointerTarget !== "intent") {
    const pointTarget = getElementAtPoint(root, event.point);
    if (pointTarget) {
      return pointTarget;
    }
  }

  return getEventTarget(root, event);
}

function isDomAction(value: unknown): value is AirpointDomIntentAction {
  return (
    typeof value === "string" &&
    DOM_ACTIONS.has(value as AirpointDomIntentAction)
  );
}

function getMetadataAction(event: AirpointIntentEvent) {
  const metadata = event.intent.metadata as
    | AirpointDomIntentMetadata
    | undefined;
  if (isDomAction(metadata?.domAction)) {
    return metadata.domAction;
  }
  if (isDomAction(metadata?.action)) {
    return metadata.action;
  }
  return undefined;
}

function resolveAction(
  event: AirpointIntentEvent,
  options: AirpointDomAdapterOptions,
): AirpointDomIntentAction {
  const configuredAction = options.actions?.[event.intent.id];
  if (configuredAction) {
    return configuredAction;
  }

  const metadataAction = getMetadataAction(event);
  if (metadataAction) {
    return metadataAction;
  }

  const defaultAction = options.defaultAction ?? "auto";
  if (defaultAction !== "auto") {
    return defaultAction;
  }

  return event.intent.phase === "tap" ? "click" : "dispatch_event";
}

function dispatchAirpointEvents(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  event: AirpointIntentEvent,
) {
  const CustomEventCtor = getWindow(root).CustomEvent;
  if (!target || !CustomEventCtor) {
    return;
  }

  const init: CustomEventInit<AirpointIntentEvent> = {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: event,
  };
  target.dispatchEvent(new CustomEventCtor("airpoint:intent", init));
  target.dispatchEvent(
    new CustomEventCtor(`airpoint:${event.intent.id}`, init),
  );
}

function mouseEventInit(
  root: AirpointDomAdapterRoot | null,
  event: AirpointIntentEvent,
): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    clientX: event.point?.x ?? 0,
    clientY: event.point?.y ?? 0,
    composed: true,
    view: getDefaultView(root) ?? undefined,
  };
}

function dispatchMouseEvent(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  type: string,
  event: AirpointIntentEvent,
) {
  const MouseEventCtor = getWindow(root).MouseEvent;
  if (!target || !MouseEventCtor) {
    return false;
  }
  return target.dispatchEvent(
    new MouseEventCtor(type, mouseEventInit(root, event)),
  );
}

function dispatchPointerEvent(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  type: string,
  event: AirpointIntentEvent,
) {
  const PointerEventCtor = getWindow(root).PointerEvent;
  if (!target || !PointerEventCtor) {
    return false;
  }
  return target.dispatchEvent(
    new PointerEventCtor(type, {
      ...mouseEventInit(root, event),
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
}

function dispatchPressStart(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  event: AirpointIntentEvent,
) {
  dispatchPointerEvent(root, target, "pointerdown", event);
  dispatchMouseEvent(root, target, "mousedown", event);
}

function dispatchPressEnd(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  event: AirpointIntentEvent,
) {
  dispatchPointerEvent(root, target, "pointerup", event);
  dispatchMouseEvent(root, target, "mouseup", event);
}

function clickTarget(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  event: AirpointIntentEvent,
) {
  if (!target) {
    return;
  }

  dispatchPressStart(root, target, event);
  focusTarget(root, target);
  dispatchPressEnd(root, target, event);

  if (isHtmlElement(root, target) && typeof target.click === "function") {
    target.click();
    return;
  }
  dispatchMouseEvent(root, target, "click", event);
}

function contextMenuTarget(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  event: AirpointIntentEvent,
) {
  dispatchMouseEvent(root, target, "contextmenu", event);
}

function doubleClickTarget(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  event: AirpointIntentEvent,
) {
  clickTarget(root, target, event);
  clickTarget(root, target, event);
  dispatchMouseEvent(root, target, "dblclick", event);
}

function focusTarget(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
) {
  if (isHtmlElement(root, target) || isSvgElement(root, target)) {
    target.focus();
  }
}

function blurTarget(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
) {
  if (isHtmlElement(root, target) || isSvgElement(root, target)) {
    target.blur();
  }
}

function submitTarget(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
) {
  if (!isElement(root, target)) {
    return;
  }
  const form = isFormElement(root, target) ? target : target.closest("form");
  if (!form) {
    return;
  }
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  form.submit();
}

function scrollTargetIntoView(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  behavior: ScrollBehavior | undefined,
) {
  if (isElement(root, target)) {
    target.scrollIntoView({ behavior, block: "nearest", inline: "nearest" });
  }
}

function performDomAction(
  root: AirpointDomAdapterRoot | null,
  target: EventTarget | null,
  action: AirpointDomIntentAction,
  event: AirpointIntentEvent,
  options: AirpointDomAdapterOptions,
) {
  switch (action) {
    case "blur":
      blurTarget(root, target);
      return;
    case "click":
      clickTarget(root, target, event);
      return;
    case "context_menu":
      contextMenuTarget(root, target, event);
      return;
    case "double_click":
      doubleClickTarget(root, target, event);
      return;
    case "focus":
      focusTarget(root, target);
      return;
    case "scroll_into_view":
      scrollTargetIntoView(root, target, options.scrollBehavior);
      return;
    case "submit":
      submitTarget(root, target);
      return;
    case "toggle":
      clickTarget(root, target, event);
      return;
    case "auto":
    case "dispatch_event":
    case "none":
      return;
  }
}

export function createAirpointDomAdapter(
  options: AirpointDomAdapterOptions = {},
): AirpointHostAdapter {
  const root = getRoot(options);

  return {
    getViewport() {
      const view = getDefaultView(root);
      return view
        ? { height: view.innerHeight, width: view.innerWidth }
        : { height: 0, width: 0 };
    },
    resolveTarget(targetName, context) {
      return queryTarget(root, context.manifest.dom.targets[targetName]);
    },
    performIntent(event) {
      const action = resolveAction(event, options);
      const target = getActionTarget(root, event, action, options);
      if (options.sendCustomEvents !== false) {
        dispatchAirpointEvents(root, target, event);
      }
      performDomAction(root, target, action, event, options);
    },
  };
}
