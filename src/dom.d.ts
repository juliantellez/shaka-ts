// Ambient augmentation for the vendor and experimental browser APIs the player
// uses that are not in the standard DOM library. Shaka declares these in its own
// Closure externs; this mirrors the ones the transpiled library reaches for.
//
// Emitted into the transpiled output as a declaration file, so `skipLibCheck`
// leaves its own internals unchecked while the library files resolve against it.

export {};

declare global {
  interface Navigator {
    /** The Network Information API, not in the standard library. */
    connection?: {
      readonly type?: string;
      readonly effectiveType?: string;
      readonly downlink?: number;
      readonly rtt?: number;
      readonly saveData?: boolean;
      addEventListener(type: string, listener: () => void): void;
      removeEventListener(type: string, listener: () => void): void;
    };
    emeEncryptionSchemePolyfilled?: boolean;
    mediaCapabilitiesEncryptionSchemePolyfilled?: boolean;
  }

  interface HTMLMediaElement {
    audioTracks?: { length: number; [index: number]: { enabled: boolean; language: string } };
    videoTracks?: { length: number; [index: number]: { selected: boolean } };
    videoWidth?: number;
    videoHeight?: number;
    poster?: string;
    disablePictureInPicture?: boolean;
    getStartDate?(): Date;
    requestPictureInPicture?(): Promise<unknown>;
    requestVideoFrameCallback?(callback: (now: number, metadata: object) => void): number;
    cancelVideoFrameCallback?(handle: number): void;
    getVideoPlaybackQuality?(): { droppedVideoFrames: number; totalVideoFrames: number };
    webkitDroppedFrameCount?: number;
    webkitSupportsFullscreen?: boolean;
    webkitDisplayingFullscreen?: boolean;
    webkitPresentationMode?: string;
    webkitCurrentPlaybackTargetIsWireless?: boolean;
    webkitEnterFullscreen?(): void;
    webkitExitFullscreen?(): void;
    webkitShowPlaybackTargetPicker?(): void;
    generateKeyRequest?(keySystem: string, initData?: Uint8Array): void;
    webkitGenerateKeyRequest?(keySystem: string, initData?: Uint8Array): void;
  }

  interface Document {
    webkitCurrentFullScreenElement?: Element | null;
  }

  interface Screen {
    unlockOrientation?(): boolean;
    mozLockOrientation?(orientation: string): boolean;
    mozUnlockOrientation?(): boolean;
    msLockOrientation?(orientation: string): boolean;
    msUnlockOrientation?(): boolean;
  }

  interface Window {
    ManagedMediaSource?: typeof MediaSource;
    ManagedSourceBuffer?: typeof SourceBuffer;
    documentPictureInPicture?: { requestWindow(options?: object): Promise<Window> };
    shakaMediaKeysPolyfill?: string;
    WebKitMediaKeys?: {
      new (keySystem: string): unknown;
      isTypeSupported(keySystem: string, contentType: string): boolean;
    };
    WebKitPlaybackTargetAvailabilityEvent?: unknown;
    ISOBoxer?: unknown;
    msdk?: unknown;
    PalmSystem?: { deviceInfo?: string };
    __onGCastApiAvailable?: (available: boolean) => void;
  }
}
