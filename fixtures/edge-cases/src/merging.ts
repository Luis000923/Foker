export interface Box {
  width: number;
}

export interface Box {
  height: number;
}

export const enum Direction {
  Up,
  Down,
}

export abstract class Shape {
  abstract area(): number;
}

let counter = 0;
export { counter as count };
export default Shape;
