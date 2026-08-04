import "@testing-library/jest-dom/vitest";

// jsdom 未实现 PointerEvent：fireEvent.pointerDown 会回退成 new Event() 丢掉坐标，
// 补一个继承 MouseEvent 的构造器，让指针事件的 clientX/clientY/pointerId 正常传递
if (typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(window, "PointerEvent", { value: PointerEvent, configurable: true });
}

// jsdom 未实现指针捕获：拖拽测试用到，桩掉即可（捕获语义由真实浏览器保证）
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

