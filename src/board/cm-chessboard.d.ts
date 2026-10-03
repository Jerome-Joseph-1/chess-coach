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

  export class Chessboard {
    constructor(context: HTMLElement, props?: ChessboardProps);
    setPosition(fen: string, animated?: boolean): Promise<void>;
    setOrientation(color: Color, animated?: boolean): Promise<void>;
    getOrientation(): Color;
    getExtension<T>(extension: new (...args: never[]) => T): T | null;
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
  export interface MarkerType {
    class: string;
    slice: string;
    position?: 'above';
  }

  export class Markers {
    constructor(chessboard: unknown, props?: object);
    /** While true, addMarker and removeMarkers skip the redraw. */
    batchUpdate: boolean;
    onRedrawBoard(): void;
    addMarker(type: MarkerType, square: string): void;
    removeMarkers(type?: MarkerType, square?: string): void;
  }
}

declare module 'cm-chessboard/src/extensions/arrows/Arrows.js' {
  export interface ArrowType {
    class: string;
  }

  export class Arrows {
    constructor(chessboard: unknown, props?: object);
    addArrow(type: ArrowType, from: string, to: string): void;
    /** Removes the arrows that match; with no arguments, all of them. */
    removeArrows(type?: ArrowType, from?: string, to?: string): void;
  }
}
