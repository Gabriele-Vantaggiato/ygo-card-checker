import type { YgoProDeckCard } from './types';

export type FrameType =
  | 'normal'
  | 'effect'
  | 'fusion'
  | 'synchro'
  | 'xyz'
  | 'link'
  | 'ritual'
  | 'pendulum'
  | 'token'
  | 'skill'
  | 'other';

const EXTRA_DECK_FRAMES = new Set<FrameType>(['fusion', 'synchro', 'xyz', 'link']);

export interface CardFrameInfo {
  frameType: FrameType;
  linkVal: number | null;
  pendulumScale: number | null;
  isExtraDeck: boolean;
}

export function deriveCardFrame(card: YgoProDeckCard): CardFrameInfo {
  const typeLower = card.type.toLowerCase();
  const apiFrame = card.frameType?.toLowerCase();

  let frameType: FrameType = 'other';
  if (apiFrame && isFrameType(apiFrame)) {
    frameType = apiFrame;
  } else if (typeLower.includes('link monster')) {
    frameType = 'link';
  } else if (typeLower.includes('xyz monster')) {
    frameType = 'xyz';
  } else if (typeLower.includes('synchro monster')) {
    frameType = 'synchro';
  } else if (typeLower.includes('fusion monster')) {
    frameType = 'fusion';
  } else if (typeLower.includes('ritual monster')) {
    frameType = 'ritual';
  } else if (typeLower.includes('pendulum')) {
    frameType = 'pendulum';
  } else if (typeLower.includes('token')) {
    frameType = 'token';
  } else if (typeLower.includes('skill card')) {
    frameType = 'skill';
  } else if (typeLower.includes('normal monster')) {
    frameType = 'normal';
  } else if (typeLower.includes('effect monster') || typeLower.includes('/ effect')) {
    frameType = 'effect';
  }

  const linkVal = card.linkval ?? null;
  const pendulumScale = card.scale ?? null;

  return {
    frameType,
    linkVal,
    pendulumScale,
    isExtraDeck: EXTRA_DECK_FRAMES.has(frameType),
  };
}

function isFrameType(value: string): value is FrameType {
  return [
    'normal',
    'effect',
    'fusion',
    'synchro',
    'xyz',
    'link',
    'ritual',
    'pendulum',
    'token',
    'skill',
    'other',
  ].includes(value);
}
