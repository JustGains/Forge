export const OPTIM_INJURY_DISCLOSURE =
  'Forge does not automatically filter exercises from injury labels. Review every movement and use Swap or Adjust to follow guidance from your healthcare professional.'

export function getOptimInjuryLabels(injuries: readonly string[]): string[] {
  return [...new Set(injuries.map(injury => injury.trim()).filter(Boolean))]
}

export function buildOptimInjuryReviewDescription(injuries: readonly string[]): string {
  const labels = getOptimInjuryLabels(injuries)
  return labels.length > 0
    ? `Saved injuries / limitations: ${labels.join(', ')}. ${OPTIM_INJURY_DISCLOSURE}`
    : OPTIM_INJURY_DISCLOSURE
}
