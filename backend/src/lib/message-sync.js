function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeComparableContent(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function parseComparableTimestamp(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1e12 ? value : value * 1000;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function pickBestPendingMessage(candidates, target) {
  const normalizedTargetContent = normalizeComparableContent(target?.content);
  const targetTimestamp = parseComparableTimestamp(target?.timestamp);
  const targetMessageType = target?.messageType || 'text';
  const targetQuotedMessageId = target?.quotedMessageId || null;
  const targetMediaMimetype = target?.mediaMimetype || null;

  const scored = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      if (!candidate || candidate.message_type !== targetMessageType) {
        return { candidate, score: -1 };
      }

      let score = 3;
      const normalizedCandidateContent = normalizeComparableContent(candidate.content);

      if (normalizedTargetContent) {
        if (normalizedCandidateContent === normalizedTargetContent) {
          score += 4;
        } else if (
          normalizedCandidateContent &&
          (normalizedCandidateContent.includes(normalizedTargetContent) ||
            normalizedTargetContent.includes(normalizedCandidateContent))
        ) {
          score += 2;
        } else {
          score = -1;
        }
      } else if (!normalizedCandidateContent) {
        score += 1;
      }

      if (score >= 0 && targetQuotedMessageId) {
        if (candidate.quoted_message_id === targetQuotedMessageId) {
          score += 3;
        } else if (candidate.quoted_message_id) {
          score -= 2;
        }
      }

      if (
        score >= 0 &&
        targetMediaMimetype &&
        candidate.media_mimetype &&
        candidate.media_mimetype === targetMediaMimetype
      ) {
        score += 1;
      }

      const candidateTimestamp = parseComparableTimestamp(candidate.timestamp);
      if (score >= 0 && targetTimestamp && candidateTimestamp) {
        const diffMs = Math.abs(targetTimestamp.getTime() - candidateTimestamp.getTime());
        if (diffMs <= 15000) score += 2;
        else if (diffMs <= 120000) score += 1;
        else if (diffMs > 600000) score -= 4;
      }

      return { candidate, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const minimumScore = targetMessageType === 'text'
    ? (normalizedTargetContent ? 6 : 7)
    : 5;

  if (!best || best.score < minimumScore) {
    return null;
  }

  if (second && second.score === best.score) {
    return null;
  }

  return best.candidate;
}

export function summarizeHandlerOutcomes(outcomes, fallback = { processed: true, processResult: 'saved', processError: null }) {
  const priority = {
    error: 7,
    saved: 6,
    linked_pending: 5,
    updated: 4,
    duplicate: 3,
    skipped: 2,
    ignored: 1,
  };

  const validOutcomes = (Array.isArray(outcomes) ? outcomes : []).filter(Boolean);
  if (validOutcomes.length === 0) {
    return fallback;
  }

  return validOutcomes.sort((a, b) => {
    const aPriority = priority[a.processResult] || 0;
    const bPriority = priority[b.processResult] || 0;
    return bPriority - aPriority;
  })[0];
}