import { describe, expect, it } from 'vitest';
import { anyObjectionable, containsObjectionableLanguage } from '../contentFilter';

describe('containsObjectionableLanguage', () => {
  it('lets ordinary club talk through', () => {
    for (const text of [
      'Anyone up for doubles Saturday at 10:30?',
      'Looking for a 3.5 or 4.0 hitting partner',
      'Class assessment for the Scunthorpe clinic is on court 5',
      'Bring spicy snacks and spices to the social',
      'My shot selection was bad, I kept hitting it out',
    ]) {
      expect(containsObjectionableLanguage(text), text).toBe(false);
    }
  });

  it('catches profanity and slurs, including common endings', () => {
    for (const text of ['You are a bitch', 'what the FUCK', 'stop fucking around', 'this is shitty']) {
      expect(containsObjectionableLanguage(text), text).toBe(true);
    }
  });

  it('catches character swaps and spaced-out letters', () => {
    for (const text of ['sh1t', 'b!tch', 'f.u.c.k you', '$hit']) {
      expect(containsObjectionableLanguage(text), text).toBe(true);
    }
  });

  it('ignores non-strings and empty text', () => {
    expect(containsObjectionableLanguage(undefined)).toBe(false);
    expect(containsObjectionableLanguage('')).toBe(false);
    expect(containsObjectionableLanguage(42)).toBe(false);
  });
});

describe('anyObjectionable', () => {
  it('is true when any field fails', () => {
    expect(anyObjectionable('fine', undefined, 'shit')).toBe(true);
    expect(anyObjectionable('fine', undefined, 'also fine')).toBe(false);
  });
});
