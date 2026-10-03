// cm-chessboard ships plain JavaScript; this declares the small part of it the board uses.
declare module 'cm-chessboard' {
  type Color = 'w' | 'b';

  export const INPUT_EVENT_TYPE: {
    moveInputStarted: string;
    movingOverSquare: string;
    validateMoveInput: string;
    moveInputCanceled: string;
    moveInputFinished: string;
  };
  export const POINTER_EVENTS: { pointerdown: string };

  export interface MoveInputEvent {
    type: string;
    squareFrom: string;
    squareTo?: string | null;
  }

  export interface ChessboardProps {
    position?: string;
    orientation?: Color;
    assetsUrl?: string;
    style?: {
      cssClass?: string;
      showCoordinates?: boolean;
      borderType?: string;
      animationDuration?: number;
      pieces?: { file?: string; tileSize?: number };
    };
    extensions?: { class: unknown; props?: object }[];
  }

  /** The parts of the board's drawing the motion effects read. */
  export interface ChessboardView {
    squareWidth: number;
    /** Top left corner of a square, in the SVG's pixels. */
    squareToPoint(square: string): { x: number; y: number };
    piecesLayer: SVGGElement;
    piecesGroup: SVGGElement;
  }

  export class Chessboard {
    constructor(context: HTMLElement, props?: ChessboardProps);
    view: ChessboardView;
    setPosition(fen: string, animated?: boolean): Promise<void>;
    setOrientation(color: Color, animated?: boolean): Promise<void>;
    getOrientation(): Color;
    getExtension<T>(extension: abstract new (...args: never[]) => T): T | null;
    enableMoveInput(handler: (event: MoveInputEvent) => boolean | void, color?: Color): void;
    disableMoveInput(): void;
    cancelMoveInput(): void;
    enableSquareSelect(eventType: string, handler: (event: { square: string | null }) => void): void;
    disableSquareSelect(eventType: string): void;
    isSquareSelectEnabled(): boolean;
    destroy(): void;
  }
}

declare module 'cm-chessboard/src/extensions/markers/Markers.js' {
  import type { ChessboardView } from 'cm-chessboard';

  export interface MarkerType {
    class: string;
    slice: string;
    position?: 'above';
  }

  export interface Marker {
    square: string;
    type: MarkerType;
  }

  export class Markers {
    constructor(chessboard: unknown, props?: object);
    protected chessboard: { view: ChessboardView };
    /** While true, addMarker and removeMarkers skip the redraw. */
    batchUpdate: boolean;
    /** Removes every marker element and draws them all again. */
    onRedrawBoard(): void;
    protected drawMarker(marker: Marker): SVGGElement;
    addMarker(type: MarkerType, square: string): void;
    removeMarkers(type?: MarkerType, square?: string): void;
  }
}

declare module 'cm-chessboard/src/extensions/arrows/Arrows.js' {
  export interface ArrowType {
    class: string;
  }

  export interface Arrow {
    from: string;
    to: string;
    type: ArrowType;
    matches(from?: string, to?: string, type?: ArrowType): boolean;
  }

  export class Arrows {
    constructor(chessboard: unknown, props?: object);
    protected arrows: Arrow[];
    /** Holds one group per arrow, emptied and filled again on every change. */
    protected arrowGroup: SVGGElement;
    onRedrawBoard(): void;
    protected drawArrow(arrow: Arrow): void;
    addArrow(type: ArrowType, from: string, to: string): void;
    /** Removes the arrows that match; with no arguments, all of them. */
    removeArrows(type?: ArrowType, from?: string, to?: string): void;
  }
}
