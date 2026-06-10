import { describe, expect, it } from 'vitest';
import {
  buildBulletinPostShareEmailContent,
  buildBulletinPostShareUrl,
  formatSignupFee,
  isPaidSignupPost,
  mapPostFromApi,
} from '../bulletinPostDisplay';

describe('bulletinPostDisplay', () => {
  it('detects paid signup posts', () => {
    expect(isPaidSignupPost({ requirePayment: true, signupAmountCents: 1500 })).toBe(true);
    expect(isPaidSignupPost({ requirePayment: false, signupAmountCents: 1500 })).toBe(false);
    expect(isPaidSignupPost({ signupAmountCents: 0 })).toBe(false);
  });

  it('formats signup fee', () => {
    expect(formatSignupFee(2500)).toBe('$25.00');
    expect(formatSignupFee(null)).toBe('');
  });

  it('maps API post shape', () => {
    const view = mapPostFromApi({
      id: 'p1',
      title: 'Clinic',
      content: 'Details',
      category: 'clinic',
      facilityId: 'f1',
      signupAmountCents: 1000,
      requirePayment: true,
    });
    expect(view.type).toBe('clinic');
    expect(view.signupAmountCents).toBe(1000);
    expect(view.requirePayment).toBe(true);
  });

  it('builds bulletin share URL and email content', () => {
    const post = {
      id: 'p1',
      title: 'Saturday Clinic',
      content: 'All levels welcome.',
      category: 'clinic',
      facilityId: 'f1',
      facilityName: 'Tennis Club',
      authorName: 'Coach Pat',
      drillStartAt: '2026-06-14T10:00:00.000Z',
      drillCourtName: 'Court 1',
    };

    const url = buildBulletinPostShareUrl(post, 'https://app.example.com');
    expect(url).toContain('clubId=f1');
    expect(url).toContain('postId=p1');
    expect(url).toContain('clubName=Tennis+Club');

    const email = buildBulletinPostShareEmailContent(post, {
      senderName: 'Alex Member',
      personalMessage: 'Thought you would like this.',
      appOrigin: 'https://app.example.com',
    });
    expect(email.subject).toContain('Saturday Clinic');
    expect(email.subject).toContain('Tennis Club');
    expect(email.plainTextBody).toContain('Alex Member');
    expect(email.plainTextBody).toContain('Thought you would like this.');
    expect(email.plainTextBody).toContain('All levels welcome.');
    expect(email.plainTextBody).toContain(url);
  });
});
