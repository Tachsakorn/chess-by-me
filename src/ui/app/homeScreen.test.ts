import { describe, expect, it } from 'vitest';
import { offerHomeScreen } from './homeScreen';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

describe('offerHomeScreen', () => {
  it('offers the guide on an iPhone and an iPad, in the browser', () => {
    expect(offerHomeScreen({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(offerHomeScreen({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5, standalone: false })).toBe(
      true,
    );
  });

  it('not once the app is opened from the Home Screen', () => {
    expect(offerHomeScreen({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBe(false);
  });

  it('not on a Mac, Android or a computer', () => {
    expect(offerHomeScreen({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0, standalone: false })).toBe(
      false,
    );
    expect(offerHomeScreen({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false })).toBe(
      false,
    );
  });
});
