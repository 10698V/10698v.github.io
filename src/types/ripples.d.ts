import 'jquery';

declare global {
  interface Window {
    jQuery: JQueryStatic;
    $: JQueryStatic;
    __PRIM3_RIPPLE_DPR: number;
  }

  interface JQuery {
    ripples(
      method: 'drop',
      x: number,
      y: number,
      radius: number,
      strength: number
    ): void;

    ripples(options: {
      resolution?: number;
      dropRadius?: number;
      perturbance?: number;
      interactive?: boolean;
      crossOrigin?: string;
    }): JQuery;
  }
}

export { };
