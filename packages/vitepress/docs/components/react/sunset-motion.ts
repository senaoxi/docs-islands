// Sunset v2's complete native frame sequences. Never mirror the right-run row
// or truncate a stride at a CSS direction change.
export const jumpFrames = [140, 140, 140, 140, 280];
export const runFrames = [120, 120, 120, 120, 120, 120, 120, 220];
export const thinkingFrames = [450, 450, 450, 450, 450, 780];
const total = (frames: number[]) => frames.reduce((sum, hold) => sum + hold, 0);
export const jumpDuration = total(jumpFrames);
export const runDuration = total(runFrames);
export const thinkingDuration = total(thinkingFrames);
const ramp = 400;

function frameAt(elapsed: number, frames: number[]) {
  let end = 0;
  const index = frames.findIndex((hold) => {
    end += hold;
    return elapsed < end;
  });
  return index === -1 ? frames.length - 1 : index;
}

// Complete the current stride and leave enough time to slow down before
// changing direction. The return uses the same number of complete strides.
function outboundDuration(nominal: number, reverseAfter?: number) {
  if (reverseAfter === undefined) return nominal;
  return Math.min(
    nominal,
    Math.max(
      runDuration,
      Math.ceil((reverseAfter - jumpDuration + ramp) / runDuration) *
        runDuration,
    ),
  );
}
function travelled(elapsed: number, duration: number) {
  const time = Math.max(0, Math.min(elapsed, duration));
  const departure = time < ramp ? (time * time) / (2 * ramp) : time - ramp / 2;
  const braking = Math.max(0, time - duration + ramp);
  return departure - (braking * braking) / (2 * ramp);
}
export function getSunsetArrival(nominal: number, reverseAfter?: number) {
  const outward = outboundDuration(nominal, reverseAfter);
  return jumpDuration + outward * (reverseAfter === undefined ? 1 : 2);
}
export function getSunsetMotion(
  elapsed: number,
  nominal: number,
  reverseAfter?: number,
) {
  const outward = outboundDuration(nominal, reverseAfter);
  const arrival = getSunsetArrival(nominal, reverseAfter);
  const speed = 1 / (nominal - ramp);
  const turnPosition = speed * travelled(outward, outward);
  if (elapsed < jumpDuration)
    return {
      progress: 0,
      row: 4,
      column: frameAt(elapsed, jumpFrames),
      pose: 'jumping',
    };
  if (elapsed < jumpDuration + outward) {
    const running = elapsed - jumpDuration;
    return {
      progress: speed * travelled(running, outward),
      row: 1,
      column: frameAt(running % runDuration, runFrames),
      pose: 'running-right',
    };
  }
  if (reverseAfter !== undefined && elapsed < arrival) {
    const returning = elapsed - jumpDuration - outward;
    return {
      progress: Math.max(
        0,
        turnPosition - speed * travelled(returning, outward),
      ),
      row: 2,
      column: frameAt(returning % runDuration, runFrames),
      pose: 'running-left',
    };
  }
  return {
    progress: reverseAfter === undefined ? 1 : 0,
    row: 8,
    column: frameAt(elapsed - arrival, thinkingFrames),
    pose: elapsed < arrival + thinkingDuration ? 'thinking' : 'thinking-rest',
  };
}
