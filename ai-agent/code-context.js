import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function normalizeForSearch(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '');
}

export function scoreCodeCandidate(filePath, source, terms) {
  const normalizedPath = normalizeForSearch(filePath);
  const normalizedSource = normalizeForSearch(source);
  return terms.reduce((score, term) => {
    const normalizedTerm = normalizeForSearch(term);
    if (!normalizedTerm) return score;
    return score
      + (normalizedPath.includes(normalizedTerm) ? 4 : 0)
      + (normalizedSource.includes(normalizedTerm) ? 1 : 0);
  }, 0);
}

export function findRelevantExcerpt(source, terms, maxLength = 1800) {
  if (typeof source !== 'string' || !source || !Number.isFinite(maxLength) || maxLength <= 0) return '';
  const limit = Math.floor(maxLength);
  const lines = source.split('\\n');
  const normalizedTerms = [...new Set(terms.map(normalizeForSearch).filter(Boolean))];
  if (!normalizedTerms.length) return source.slice(0, limit);

  let bestScore = -1;
  let offset = 0;
  let bestOffset = 0;
  for (const line of lines) {
    const normalizedLine = normalizeForSearch(line);
    let score = 0;
    for (const term of normalizedTerms) {
      if (!normalizedLine.includes(term)) continue;
      score += 4;
      const matches = normalizedLine.split(term).length - 1;
      score += Math.min(matches - 1, 3);
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
    offset += line.length + 1;
  }

  if (bestScore <= 0) return source.slice(0, limit);
  const start = Math.max(0, Math.min(source.length - limit, bestOffset - Math.floor(limit * 0.25)));
  return source.slice(start, start + limit);
}

const GUARDIAN_CONTEXT_FILES = Object.freeze([
  'guardian/automation.js',
  'guardian/automation.test.js',
  'ai-agent/guardian-review.js',
  'ai-agent/guardian-review.test.js',
  'ai-agent/code-context.js',
]);

const GENERIC_ROOTS = Object.freeze([
  'index.js', 'rpg-mechanics.js', 'package.json', 'scripts/check-commands.js',
  'scripts/audit-command-contracts.js', 'scripts/test-request.js', 'scripts/test-boss-combat.js',
  'scripts/test-discord-scenarios.js', 'scripts/test-uncovered-commands.js',
  'scripts/test-utils.js', 'database/db.js',
]);

const SECRET_PATTERN = /(DISCORD_TOKEN|GROQ_API_KEY|OPENAI_API_KEY|DATABASE_URL|PASSWORD|SECRET)\\s*[:=]\\s*['"`]?[^\\s,'"`]+/gi;

export async function collectCodeContext({ rootDir, question, sourceCommitSha = null, budget = 2800 } = {}) {
  if (!rootDir || typeof question !== 'string') throw new Error('INVALID_CODE_CONTEXT_INPUT');
  const terms = normalizeForSearch(question).split(/[^a-z0-9]+/).filter(word => word.length >= 3);
  const isGuardianReview = /guardian|incident|frieren/.test(normalizeForSearch(question));
  const mandatory = isGuardianReview ? [...GUARDIAN_CONTEXT_FILES] : [];
  const candidates = new Set([...mandatory, ...GENERIC_ROOTS]);
  async function scan(dir, depth = 0) {
    if (depth > 3 || candidates.size > 45) return;
    const entries = await readdir(path.join(rootDir, dir), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relative = path.posix.join(dir === '.' ? '' : dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'coverage', '.render'].includes(entry.name)) await scan(relative, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const normalized = normalizeForSearch(relative);
        if (terms.some(term => normalized.includes(term))) candidates.add(relative);
        else {
          const source = await readFile(path.join(rootDir, relative), 'utf8').catch(() => '');
          const normalizedSource = normalizeForSearch(source);
          const matches = terms.reduce((count, term) => count + (normalizedSource.includes(term) ? 1 : 0), 0);
          if (terms.length > 0 && matches >= Math.min(2, terms.length)) candidates.add(relative);
        }
      }
    }
  }
  await scan('.');
  const ranked = [];
  for (const relative of candidates) {
    const source = await readFile(path.join(rootDir, relative), 'utf8').catch(() => '');
    if (source) ranked.push({ relative, source, score: scoreCodeCandidate(relative, source, terms) });
  }
  const mandatorySet = new Set(mandatory);
  ranked.sort((a, b) => Number(mandatorySet.has(b.relative)) - Number(mandatorySet.has(a.relative)) || b.score - a.score || a.relative.localeCompare(b.relative));
  const snippets = [];
  const includedFiles = [];
  const safeBudget = Math.max(1200, Math.min(Number(budget) || 2800, 5000));
  const mandatoryBudget = mandatory.length ? Math.min(safeBudget, Math.max(3000, mandatory.length * 520)) : 0;
  let used = 0;
  for (const item of ranked) {
    const required = mandatorySet.has(item.relative);
    if (!required && used >= safeBudget) break;
    const remaining = required
      ? Math.max(0, Math.floor(mandatoryBudget / mandatory.length) - item.relative.length - 24)
      : safeBudget - used - item.relative.length - 24;
    if (remaining <= 0) continue;
    const safe = item.source.replace(SECRET_PATTERN, '$1=[REDACTED]');
    const excerpt = findRelevantExcerpt(safe, terms, Math.min(safe.length, required ? 650 : 1200, remaining));
    if (!excerpt) continue;
    snippets.push('FILE: ' + item.relative + '\\n' + excerpt);
    includedFiles.push(item.relative);
    used += excerpt.length + item.relative.length + 24;
  }
  const text = snippets.join('\\n\\n');
  return {
    text,
    files: includedFiles,
    contextHash: createHash('sha256').update(text).digest('hex'),
    sourceCommitSha: /^[a-f0-9]{40}$/i.test(String(sourceCommitSha || '')) ? String(sourceCommitSha) : null,
  };
}
