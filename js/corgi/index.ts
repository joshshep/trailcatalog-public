import { Controller, ControllerResponse } from './controller';
import { EventSpec, qualifiedName } from './events';

export const Fragment = Symbol();

type IsPrefix<P extends unknown[], T> = P extends [...P, ...unknown[]] ? P : never;
type HasParameters<M, P extends unknown[], R> =
      M extends (...args: any) => any ? IsPrefix<Parameters<M>, P> extends never ? never : R : never;
type IsMethodWithParameters<T, K extends keyof T, P extends unknown[]> = HasParameters<T[K], P, K>;
type AMethodOnWithParameters<T, P extends unknown[]> = keyof {[K in keyof T as IsMethodWithParameters<T, K, P>]: 'valid'};

interface PropertyKeyToHandlerMap<C> {
  corgi: Array<[
    EventSpec<unknown>,
    AMethodOnWithParameters<C, [CustomEvent<unknown>]>,
  ]>;
  render: AMethodOnWithParameters<C, []>,
}

type StateTuple<S> = S extends undefined ? undefined : [S, (newState: S) => void];

interface BoundController<
        A,
        E extends HTMLElement,
        S,
        R extends ControllerResponse<A, E, S>,
        C extends Controller<A, E, S, R>
    > {
  args: A;
  controller: new (response: R) => C;
  events: Partial<PropertyKeyToHandlerMap<C>>;
  instance?: C;
  state: StateTuple<S>,
}

interface AnyBoundController<E extends HTMLElement>
    extends BoundController<any, E, any, any, any> {}

const elementsToControllerSpecs = new Map<HTMLElement, AnyBoundController<HTMLElement>>();

export function bind<
    A,
    E extends HTMLElement,
    S,
    R extends ControllerResponse<A, E, S>,
    C extends Controller<A, E, S, R>
>({args, controller, events, state}: {
  args: A,
  controller: new (response: R) => C,
  events?: Partial<PropertyKeyToHandlerMap<C>>,
  state: StateTuple<S>,
}): BoundController<A, E, S, R, C> {
  return {
    args,
    controller,
    events: events ?? {},
    state,
  };
}

interface Properties<E extends HTMLElement> {
  children?: VElementOrPrimitive[];
  className?: string;
  js?: AnyBoundController<E>;
}

interface AnchorProperties extends Properties<HTMLAnchorElement> {
  href?: string;
}

class CorgiElement {
  constructor(
      public readonly element: HTMLElement,
      public readonly initialize: () => void,
  ) {}
}

type VHandle = object & {brand: 'VHandle'};

interface VElement {
  element: keyof HTMLElementTagNameMap;
  props: Properties<HTMLElement>;

  factory?: ElementFactory;
  factoryProps?: Properties<HTMLElement>;
  handle?: VHandle,
  state?: [object|undefined, (newState: object) => void];

  children: VElementOrPrimitive[];
}

type VElementOrPrimitive = VElement|number|string;

type ElementFactory = (
    props: Properties<HTMLElement>|null,
    state: unknown,
    updateState: (newState: object) => void,
) => VElement;

interface VContext {
  liveChildren: VElementOrPrimitive[];
  reconstructed: number;
}

const vElementPath: VContext[] = [];
const vElementsToNodes = new WeakMap<VElement, Node>();
const vHandlesToElements = new WeakMap<VHandle, VElement>();

export function createVirtualElement(
    element: keyof HTMLElementTagNameMap|ElementFactory|(typeof Fragment),
    props: Properties<HTMLElement>|null,
    ...children: Array<VElementOrPrimitive|VElementOrPrimitive[]>): VElementOrPrimitive {
  const expandChildren = [];
  for (const c of children) {
    if (c instanceof Array) {
      expandChildren.push(...c);
    } else {
      expandChildren.push(c);
    }
  }

  props = props ?? {};

  if (typeof element === 'function') {
    // Don't let the TSX method corrupt our props
    const propClone = Object.assign({}, props);
    propClone.children = expandChildren;

    let previousElement;
    if (vElementPath.length > 0) {
      const top = vElementPath[vElementPath.length - 1];
      if (top.liveChildren.length > top.reconstructed) {
        const candidate = top.liveChildren[top.reconstructed];
        if (typeof candidate == 'object' && candidate.factory === element) {

          previousElement = candidate;
        }
      }
      top.reconstructed += 1;
    }

    // Optimistic check
    if (previousElement && shallowEqual(props, checkExists(previousElement.factoryProps))) {
      return previousElement;
    }

    let handle;
    let state: object|undefined;
    let updateState;
    if (previousElement) {
      handle = checkExists(previousElement.handle);
      state = checkExists(previousElement.state)[0];
      updateState = checkExists(previousElement.state)[1];

      vElementPath.push({
        liveChildren: previousElement.children,
        reconstructed: 0,
      });
    } else {
      const h = {} as VHandle;
      handle = h;
      updateState = (newState: object) => {
        const v = vHandlesToElements.get(h);
        if (v) {
          updateToState(v, newState);
        }
      };

      vElementPath.push({
        liveChildren: [],
        reconstructed: 0,
      });
    }

    let v;
    try {
      v = element(propClone, state, updateState);
    } finally {
      vElementPath.pop();
    }

    v.factory = element;
    v.factoryProps = props;
    v.handle = handle;
    v.state = [state, updateState];
    vHandlesToElements.set(handle, v);

    return v;
  } else if (element === Fragment) {
    if (expandChildren.length === 1) {
      return expandChildren[0];
    } else {
      return {
        element: 'div',
        props,
        children: expandChildren,
      };
    }
  } else {
    return {
      element,
      props,
      children: expandChildren,
    };
  }
}

function updateToState(element: VElement, newState: object): void {
  if (vElementPath.length > 0) {
    throw new Error('Unable to handle vElementPath.length > 0');
  }

  if (!element.factory || !element.state) {
    throw new Error('Cannot update element without a factory');
  }

  const node = vElementsToNodes.get(element);
  if (!node) {
    return;
  }

  vElementPath.push({
    liveChildren: element.children,
    reconstructed: 0,
  });
  let newElement;
  try {
    newElement = element.factory(element.props, newState, element.state[1]);
  } finally {
    vElementPath.pop();
  }

  const result = applyUpdate(element, newElement);
  if (node !== result.root) {
    node.parentNode?.replaceChild(result.root, node);
  }

  Object.assign(element, newElement);
  vElementsToNodes.set(element, node);
  result.sideEffects.forEach(e => { e(); });
}

function applyUpdate(from: VElement|undefined, to: VElement): InstantiationResult {
  if (!from || from.element !== to.element) {
    const element = createElement(to);
    vElementsToNodes.set(to, element.root);
    return element;
  }

  const node = vElementsToNodes.get(from) as Element;
  if (!node) {
    throw new Error('Expecting an existing node but unable to find it');
  }
  const result: InstantiationResult = {
    root: node,
    sideEffects: [],
  };

  const oldPropKeys = Object.keys(from.props) as Array<keyof Properties<HTMLElement>>;
  const newPropKeys = Object.keys(to.props) as Array<keyof Properties<HTMLElement>>;
  for (const key of newPropKeys) {
    if (key === 'children' || key === 'js') {
      continue;
    }

    if (from.props[key] !== to.props[key]) {
      if (key === 'className') {
        node.className = checkExists(to.props[key]);
      } else {
        node.setAttribute(key, checkExists(to.props[key]));
      }
    }
  }
  for (const key of oldPropKeys) {
    if (!to.props.hasOwnProperty(key)) {
      node.removeAttribute(key);
    }
  }

  const oldChildren = [...node.childNodes];
  for (let i = 0; i < to.children.length; ++i) {
    const was = from.children[i];
    const is = to.children[i];

    if (was === is) {
      continue;
    }

    if (typeof was !== 'object' || typeof is !== 'object') {
      const childResult = createElement(is);
      if (i < oldChildren.length) {
        node.replaceChild(childResult.root, node.childNodes[i]);
      } else {
        node.appendChild(childResult.root);
      }
      result.sideEffects.push(...childResult.sideEffects);
      continue;
    }

    const childResult = applyUpdate(was, is);
    const oldNode = was?.element ? vElementsToNodes.get(was) : undefined;
    if (!oldNode) {
      node.appendChild(childResult.root);
    } else if (oldNode !== childResult.root) {
      oldNode.replaceChild(childResult.root, oldNode);
    }
    result.sideEffects.push(...childResult.sideEffects);
  }
  for (let i = to.children.length; i < from.children.length; ++i) {
    node.lastChild!!.remove();
  }

  vElementsToNodes.set(to, result.root);
  return result;
}

function maybeInstantiateAndCall<E extends HTMLElement>(
    root: E,
    spec: AnyBoundController<E>,
    fn: (controller: Controller<any, E, any, any>) => void): void {
  if (!spec.instance) {
    spec.instance = new spec.controller({
      root,
      args: spec.args,
      state: spec.state,
    });
  }

  fn(spec.instance);
}

interface InstantiationResult {
  root: Node;
  sideEffects: Array<() => void>;
}

function createElement(element: VElementOrPrimitive): InstantiationResult {
  if (typeof element !== 'object') {
    return {
      root: new Text(String(element)),
      sideEffects: [],
    };
  }

  const root = document.createElement(element.element);
  vElementsToNodes.set(element, root);
  let maybeSpec: AnyBoundController<HTMLElement>|undefined;

  const children = element.children;
  const props = element.props;
  for (const [key, value] of Object.entries(props)) {
    if (key === 'js') {
      maybeSpec = value;
    } else if (key === 'className') {
      root.className = value;
    } else {
      root.setAttribute(key, value);
    }
  }

  const sideEffects = [];

  for (const child of children) {
    const childResult = createElement(child);
    root.append(childResult.root);
    sideEffects.push(...childResult.sideEffects);
  }

  if (maybeSpec) {
    const spec = maybeSpec;
    elementsToControllerSpecs.set(root, spec);

    for (const [eventSpec, handler] of spec.events.corgi ?? []) {
      root.addEventListener(
          qualifiedName(eventSpec),
          e => {
            maybeInstantiateAndCall(root, spec, (controller: any) => {
              const method = controller[handler] as (e: CustomEvent<any>) => unknown;
              method.apply(controller, [e as CustomEvent<unknown>]);
            });
          });
    }
    if (spec.events.render) {
      const handler = spec.events.render;
      sideEffects.push(() => {
        maybeInstantiateAndCall(root, spec, (controller: any) => {
          const method = controller[handler];
          method.apply(controller, []);
        });
      });
    }
  }

  return {
    root,
    sideEffects,
  };
}

export function appendElement(parent: HTMLElement, child: VElementOrPrimitive): void {
  if (typeof child === 'object') {
    const result = createElement(child);
    parent.append(result.root);
    result.sideEffects.forEach(e => { e(); });
  } else {
    parent.append(String(child));
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      a: AnchorProperties;
      canvas: Properties<HTMLCanvasElement>;
      div: Properties<HTMLDivElement>;
      footer: Properties<HTMLElement>;
      header: Properties<HTMLElement>;
      section: Properties<HTMLElement>;
      span: Properties<HTMLSpanElement>;
    }
  }
}

function isCorgiElement(v: unknown): v is CorgiElement {
  return v instanceof CorgiElement;
}

function shallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!b.hasOwnProperty(key)) {
      return false;
    }
    const aValue = (a as {[k: string]: unknown})[key];
    const bValue = (b as {[k: string]: unknown})[key];
    if (aValue && bValue && typeof aValue === 'object' && typeof bValue === 'object') {
      if (!shallowEqual(aValue, bValue)) {
        return false;
      }
    } else if (aValue !== bValue) {
      return false;
    }
  }
  return true;
}

export function checkExists<V>(v: V|null|undefined): V {
  if (v === null || v === undefined) {
    throw new Error(`Argument is ${v}`);
  }
  return v;
}

