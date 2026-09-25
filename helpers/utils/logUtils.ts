export function logPhase(phase: string, title: string, detail?: string): void {
  const bar = '╔══════════════════════════════════════════════════════════════════╗';
  console.log(`\n${bar}`);
  console.log(`║  ${phase}: ${title}`);
  if (detail) console.log(`║  ${detail}`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');
}

export function logStep(step: string, message: string): void {
  console.log(`[${step}] ${message}`);
}
