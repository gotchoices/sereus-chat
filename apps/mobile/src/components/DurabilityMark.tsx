/**
 * DurabilityMark — a small pie that fills as one of this device's writes becomes safer
 * (docs/async-writes.md §4.1). The fill tells the story; color is kept for exceptions.
 *
 *   ○  saving       the write has not returned yet
 *   ◔  waiting      saved on this phone, queued to send
 *   ◑  sending      on its way to the others
 *   ◕  here         sent, but only this phone holds it so far ("not yet delivered")
 *   ●  delivered    another machine holds it; it survives losing this phone
 *   ◕  unconfirmed  sent; nothing will report its delivery this session (dimmed, not lost)
 *   !  failed       the others refused it (danger color)
 *
 * A waiting write that another member's write could still make fail ("may not go
 * through") gets a danger-colored ring. Delivered is the normal case: the full pie shows
 * briefly, then the mark goes (the tracker stops following a delivered write).
 *
 * Durability only: never a read state. A reply is the only evidence a message was read
 * (design/specs/domain/schema.md).
 */
import React from 'react';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import type { Delivery, Durability } from '@chat/core';

const FILL: Record<Durability, number> = {
  saving: 0, waiting: 0.25, sending: 0.5, here: 0.75, unconfirmed: 0.75, delivered: 1, failed: 0,
};

export interface DurabilityMarkProps {
  delivery: Delivery;
  /** The bubble's metadata color: the pie is drawn in it. */
  color: string;
  /** For refusals and "may not go through". */
  dangerColor: string;
  size?: number;
  testID?: string;
}

/** The pie's words, for screen readers and tests. */
export function durabilityLabel(d: Delivery, t: (key: string) => string): string {
  const base = t(`chat.delivery.${d.state}`);
  return d.mayFail ? `${base}. ${t('chat.delivery.mayFail')}` : base;
}

export function DurabilityMark({ delivery, color, dangerColor, size = 12, testID }: DurabilityMarkProps) {
  const r = size / 2;
  const stroke = Math.max(1, size / 10);
  const inner = r - stroke;
  if (delivery.state === 'failed') {
    return (
      <Svg width={size} height={size} testID={testID}>
        <Circle cx={r} cy={r} r={inner} fill={dangerColor} />
        <SvgText x={r} y={r + size * 0.32} fontSize={size * 0.85} fontWeight="bold" fill="#fff" textAnchor="middle">!</SvgText>
      </Svg>
    );
  }
  const fraction = FILL[delivery.state];
  const ring = delivery.mayFail ? dangerColor : color;
  return (
    <Svg width={size} height={size} testID={testID} opacity={delivery.state === 'unconfirmed' ? 0.5 : 1}>
      <Circle cx={r} cy={r} r={inner} stroke={ring} strokeWidth={stroke} fill="none" />
      {fraction >= 1 ? (
        <Circle cx={r} cy={r} r={inner} fill={color} />
      ) : fraction > 0 ? (
        <Path d={sector(r, inner, fraction)} fill={color} />
      ) : null}
    </Svg>
  );
}

/** A pie slice from 12 o'clock, clockwise, covering `fraction` of the circle. */
function sector(c: number, radius: number, fraction: number): string {
  const angle = fraction * 2 * Math.PI;
  const x = c + radius * Math.sin(angle);
  const y = c - radius * Math.cos(angle);
  const large = fraction > 0.5 ? 1 : 0;
  return `M ${c} ${c} L ${c} ${c - radius} A ${radius} ${radius} 0 ${large} 1 ${x} ${y} Z`;
}
