import { describe, expect, it } from 'vitest';
import { lessonSignupCheckoutUrls, splitPaymentCheckoutUrls } from '../mobileCheckoutUrls';
import { buildBulletinPostAppUrl, buildBulletinPostShareEmailContent } from '../bulletinPostDisplay';

describe('mobile deep links', () => {
  it('returns lesson sign-ups to the Lessons screen with the post id', () => {
    const urls = lessonSignupCheckoutUrls('p 1');
    expect(urls.successUrl).toBe('courttime://lessons?signupSuccess=1&postId=p%201&session_id={CHECKOUT_SESSION_ID}');
    expect(urls.cancelUrl).toBe('courttime://lessons?postId=p%201');
  });
  it('returns split-share payments to the Book tab', () => {
    expect(splitPaymentCheckoutUrls().successUrl).toContain('courttime://book?splitPaymentSuccess=1');
  });
  it('adds an app link to shared bulletin posts', () => {
    expect(buildBulletinPostAppUrl('abc')).toBe('courttime://community?tab=bulletin&postId=abc');
    const { plainTextBody } = buildBulletinPostShareEmailContent(
      { id: 'abc', facilityId: 'f1', facilityName: 'Oak', title: 'Drill', type: 'drill' } as any,
      { appOrigin: 'https://app.courttimeapp.com' }
    );
    expect(plainTextBody).toContain('Open in the CourtTime app: courttime://community?tab=bulletin&postId=abc');
  });
});
