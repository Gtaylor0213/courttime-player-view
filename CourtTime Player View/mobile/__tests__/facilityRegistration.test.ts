import { describe, expect, it } from '@jest/globals';
import {
  getFacilityRegistrationUrl,
  resolveWebAppBaseUrl,
} from '../src/utils/facilityRegistration';

describe('resolveWebAppBaseUrl', () => {
  it('uses an explicit web URL when provided', () => {
    expect(
      resolveWebAppBaseUrl('http://192.168.1.10:3001', 'https://custom.example.com/')
    ).toBe('https://custom.example.com');
  });

  it('maps local API port 3001 to Vite port 5173', () => {
    expect(resolveWebAppBaseUrl('http://192.168.1.10:3001')).toBe('http://192.168.1.10:5173');
    expect(resolveWebAppBaseUrl('http://localhost:3001')).toBe('http://localhost:5173');
  });

  it('keeps production API host as the web origin', () => {
    expect(resolveWebAppBaseUrl('https://www.courttimeapp.com')).toBe('https://www.courttimeapp.com');
  });

  it('strips a trailing /api suffix from the API base', () => {
    expect(resolveWebAppBaseUrl('https://www.courttimeapp.com/api')).toBe('https://www.courttimeapp.com');
  });
});

describe('getFacilityRegistrationUrl', () => {
  it('appends the facility registration path', () => {
    expect(getFacilityRegistrationUrl('https://www.courttimeapp.com')).toBe(
      'https://www.courttimeapp.com/register/facility'
    );
    expect(getFacilityRegistrationUrl('http://localhost:3001')).toBe(
      'http://localhost:5173/register/facility'
    );
  });
});
