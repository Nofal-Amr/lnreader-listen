// @ts-expect-error: internal React Native module without public types.
import Pressability from 'react-native/Libraries/Pressability/Pressability';

/**
 * Samsung pop-up view / freeform windows: React Native measures buttons and
 * reports finger positions from different origins (the window offset or the
 * caption bar inset), so the tiny wobble of any tap looks like the finger
 * left the button and every press was cancelled ("no button works").
 *
 * A press now also counts as inside while the finger stays close to where it
 * first touched. Full-screen behaviour is unchanged (the normal check passes).
 */
const TAP_SLOP = 24;

type Point = { pageX: number; pageY: number };
type PressEvent = {
  nativeEvent?: {
    pageX?: number;
    pageY?: number;
    changedTouches?: Point[];
    touches?: Point[];
  };
};

const touchOf = (event?: PressEvent): Point | null => {
  const native = event?.nativeEvent;
  if (!native) return null;
  const touch = native.changedTouches?.[0] ?? native.touches?.[0] ?? native;
  return typeof touch.pageX === 'number' && typeof touch.pageY === 'number'
    ? { pageX: touch.pageX, pageY: touch.pageY }
    : null;
};

export const installPopUpPressFix = () => {
  const proto = Pressability?.prototype;
  if (!proto || proto.__lnlPopUpFix) return;
  proto.__lnlPopUpFix = true;

  const receive = proto._receiveSignal;
  proto._receiveSignal = function (signal: string, event: PressEvent) {
    if (signal === 'RESPONDER_GRANT') this.__lnlStart = touchOf(event);
    const result = receive.call(this, signal, event);
    if (signal === 'RESPONDER_RELEASE' || signal === 'RESPONDER_TERMINATED') {
      this.__lnlStart = null;
    }
    return result;
  };

  const within = proto._isTouchWithinResponderRegion;
  proto._isTouchWithinResponderRegion = function (
    touch: Point,
    region: unknown,
  ) {
    if (within.call(this, touch, region)) return true;
    const start: Point | null = this.__lnlStart;
    return (
      start != null &&
      Math.hypot(start.pageX - touch.pageX, start.pageY - touch.pageY) <=
        TAP_SLOP
    );
  };
};
