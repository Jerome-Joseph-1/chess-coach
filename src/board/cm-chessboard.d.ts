// cm-chessboard ships plain JavaScript; this declares the small part of it the board uses.
declare module 'cm-chessboard' {
  type Color = 'w' | 'b';

  export const INPUT_EVENT_TYPE: {
    moveInputStarted: string;
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

  export const MARKER_TYPE: { dot: MarkerType; bevel: MarkerType };

  export class Markers {
    constructor(chessboard: unknown, props?: object);
    /** While true, addMarker and removeMarkers skip the redraw. */
    batchUpdate: boolean;
    onRedrawBoard(): void;
    addMarker(type: MarkerType, square: string): void;
    removeMarkers(type?: MarkerType, square?: string): void;
    addLegalMovesMarkers(moves: { to: string; promotion?: string }[]): void;
    removeLegalMovesMarkers(): void;
  }
}
