import { installPopUpPressFix } from '../fixPressInPopUp';

const Pressability = jest.requireActual(
  'react-native/Libraries/Pressability/Pressability',
).default;

describe('installPopUpPressFix', () => {
  beforeAll(() => installPopUpPressFix());

  const touch = (pageX: number, pageY: number) => ({
    nativeEvent: { pageX, pageY, changedTouches: [{ pageX, pageY }] },
  });
  // Button really at 100..200 x 100..150, but measured 60px higher (the
  // pop-up window offset), so the finger looks outside it.
  const measured = { left: 100, right: 200, top: 40, bottom: 90 };

  it('keeps a slightly wobbling tap inside the button', () => {
    const p = new Pressability({});
    Pressability.prototype._receiveSignal.call(
      p,
      'RESPONDER_GRANT',
      touch(150, 120),
    );
    expect(
      p._isTouchWithinResponderRegion({ pageX: 153, pageY: 124 }, measured),
    ).toBe(true);
  });

  it('still lets a real drag away cancel the press', () => {
    const p = new Pressability({});
    Pressability.prototype._receiveSignal.call(
      p,
      'RESPONDER_GRANT',
      touch(150, 120),
    );
    expect(
      p._isTouchWithinResponderRegion({ pageX: 150, pageY: 220 }, measured),
    ).toBe(false);
  });
});
